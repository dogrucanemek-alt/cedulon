import { strict as assert } from "node:assert";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

import { CedulonSession } from "../packages/mcp-server/src/session.ts";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function statePathIn(prefix: string): string {
  return join(mkdtempSync(join(tmpdir(), prefix)), "state.json");
}

function spend(session: CedulonSession, nonce: string, nowMs: number) {
  return session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: nonce.padEnd(16, "-") }, nowMs);
}

function receiptFor(keys: Keys, ref: string, i: number): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee-1",
      amount: "1",
      currency: "USD",
      policyHash: "policy-hash",
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: ref,
      timestampMs: NOW + i,
      nonce: `n${i}`.padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

describe("settle and record are one operation", () => {
  it("80 RED then GREEN: a write that fails leaves no settlement behind, in memory or on disk", () => {
    // The conflict path was fixed by checking before settling. The I/O path was
    // not: writeFileSync or renameSync throwing left the payment complete in
    // memory with the disk still holding the old state - and the next successful
    // save then wrote out a payment the caller had been told failed.
    const statePath = statePathIn("cedulon-io-");
    const session = new CedulonSession({ statePath });
    assert.equal(spend(session, "a0", 1).ok, true);

    const ledgerBefore = session.ledger.extract().length;
    const receiptsBefore = session.receipts.length;
    // POSIX: directory 0500. Windows: the directory read-only bit is ignored
    // (measured); marking the state file read-only makes the atomic rename fail.
    if (process.platform === "win32") {
      chmodSync(statePath, 0o444);
    } else {
      chmodSync(dirname(statePath), 0o500);
    }
    let denied;
    try {
      denied = spend(session, "a1", 2);
    } finally {
      if (process.platform === "win32") chmodSync(statePath, 0o666);
      else chmodSync(dirname(statePath), 0o700);
    }

    assert.equal(denied.ok, false, "the caller is told the payment did not happen");
    assert.equal(denied.ok === false && denied.reason, "state-io");
    assert.equal(session.ledger.extract().length, ledgerBefore, "nothing settled on the rail");
    assert.equal(session.receipts.length, receiptsBefore, "and no receipt was kept");

    // The next payment must not carry the failed one out to disk with it.
    assert.equal(spend(session, "a2", 3).ok, true);
    const onDisk = JSON.parse(readFileSync(statePath, "utf8"));
    assert.deepEqual(
      onDisk.receipts.map((r: SignedReceipt) => r.claims.nonce),
      ["a0".padEnd(16, "-"), "a2".padEnd(16, "-")],
      "the payment that failed never reaches the ledger",
    );
  });

  it("81 RED then GREEN: a refused payment does not spend the quota it never used", () => {
    // evaluate() takes the nonce and the slot before anything is written, so a
    // failure after that point charged the payer for a payment that never
    // happened - and with maxPayments reached, the next honest one is refused.
    const statePath = statePathIn("cedulon-quota-");
    const session = new CedulonSession({
      statePath,
      policy: {
        maxAmount: 10n,
        maxCumulative: 100n,
        maxPayments: 2,
        windowMs: 3_600_000,
        allowedPayees: ["payee-1"],
        allowedCurrencies: ["USD"],
        allowedTools: undefined,
      },
    });
    assert.equal(spend(session, "q0", 1).ok, true);

    if (process.platform === "win32") chmodSync(statePath, 0o444);
    else chmodSync(dirname(statePath), 0o500);
    try {
      assert.equal(spend(session, "q1", 2).ok, false);
    } finally {
      if (process.platform === "win32") chmodSync(statePath, 0o666);
      else chmodSync(dirname(statePath), 0o700);
    }

    assert.equal(session.engine.store.counters.allowedCount, 1, "the slot was given back");
    assert.equal(
      session.engine.store.usedNonces.has("q1".padEnd(16, "-")),
      false,
      "and so was the nonce",
    );
    assert.equal(spend(session, "q2", 3).ok, true, "the payer still has the payment they paid for");
  });

  it("82 RED then GREEN: after a conflict the session can be reloaded instead of wedged", () => {
    // A conflict is permanent today: lastSeenState stays stale and every later
    // spend is refused with no way back except restarting the process.
    const statePath = statePathIn("cedulon-reload-");
    const first = new CedulonSession({ statePath });
    assert.equal(spend(first, "r0", 1).ok, true);

    const second = new CedulonSession({ statePath });
    assert.equal(spend(second, "r1", 2).ok, true);

    assert.equal(spend(first, "r2", 3).ok === false, true);
    assert.equal(spend(first, "r3", 4).ok === false, true, "and it stays refused");

    const reloaded = first.reload();
    assert.deepEqual(reloaded.dropped, [], "nothing of this session's was unwritten");
    assert.equal(first.receipts.length, 2, "it now holds what the other writer wrote");
    assert.equal(spend(first, "r4", 5).ok, true, "and it can write again");
  });

  it("83 RED then GREEN: the lock path is guarded like the state path, and stale temp files go", (t) => {
    const statePath = statePathIn("cedulon-lock2-");
    const session = new CedulonSession({ statePath });
    assert.equal(spend(session, "l0", 1).ok, true);

    // A temp file from a process that is gone still holds a private key.
    const stale = join(dirname(statePath), `.${"state.json"}.999999.tmp`);
    writeFileSync(stale, JSON.stringify({ keys: { receiptPrivatePem: "-----BEGIN PRIVATE KEY-----" } }), {
      mode: 0o600,
    });
    assert.equal(spend(session, "l1", 2).ok, true);
    assert.deepEqual(
      readdirSync(dirname(statePath)).filter((f) => f.endsWith(".tmp")),
      [],
      "a leftover temp file holding a key is cleaned up, not left lying there",
    );

    // The lock path decides where a file gets created, so it is guarded too.
    const elsewhere = join(dirname(statePath), "elsewhere.lock");
    try {
      symlinkSync(elsewhere, `${statePath}.lock`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        if (process.platform === "win32") {
          t.skip("lock-path symlink half needs privilege on this host; stale-temp cleanup already asserted");
        }
        return;
      }
      throw err;
    }
    assert.throws(() => spend(session, "l2", 3), /cedulon-state-symlink/);
  });

  it("84 RED then GREEN: a lock held by a live foreign process says whose it is", () => {
    const statePath = statePathIn("cedulon-lockmsg-");
    const session = new CedulonSession({ statePath });
    assert.equal(spend(session, "m0", 1).ok, true);
    writeFileSync(`${statePath}.lock`, JSON.stringify({ pid: process.ppid }), { flag: "wx" });

    const refused = spend(session, "m1", 2);
    assert.equal(refused.ok, false);
    assert.equal(
      refused.ok === false && refused.reason,
      `state-locked:${process.ppid}`,
      "an operator cannot act on a lock without knowing who holds it",
    );
  });

  it("85 RED then GREEN: without an issuer key a clash between receipts is a warning, not a verdict", () => {
    // With no issuer key nothing distinguishes one submitted receipt from
    // another, so an added receipt claiming an honest rail ref still reaches the
    // clash check. It cannot be attributed, so it cannot be a failure either.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", 0);
    const shadow = receiptFor(attacker, "ref-ok", 7);
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const report = audit({
      receipts: [good, shadow],
      checkpoints: [
        signCheckpoint(
          buildCheckpointClaims(1, [good], NOW, WINDOW_END, null),
          honest.privateKeyPem,
          honest.publicKeyPem,
        ),
      ],
      extract,
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(
      report.findings.some((f) => f.code === "duplicate-ref"),
      false,
      "unattributable, so not a failure",
    );
    assert.ok(
      report.warnings.some((w) => w.code === "duplicate-ref"),
      "but still said out loud",
    );
  });

  it("86 RED then GREEN: a flood of rejected receipts is counted, not listed one by one", () => {
    // issuer-key-mismatch was one finding per receipt, and receipts are free to
    // mint - the same volume attack the witness warning already answers.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", 0);
    const flood = Array.from({ length: 40 }, (_, i) => receiptFor(attacker, `ref-x${i}`, 100 + i));
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const report = audit({
      receipts: [good, ...flood],
      checkpoints: [
        signCheckpoint(
          buildCheckpointClaims(1, [good], NOW, WINDOW_END, null),
          honest.privateKeyPem,
          honest.publicKeyPem,
        ),
      ],
      extract,
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    const mismatches = report.findings.filter((f) => f.code === "issuer-key-mismatch");
    assert.ok(mismatches.length < 40, `expected a summary, got ${mismatches.length} findings`);
    assert.ok(
      mismatches.some((f) => /40/.test(f.detail)),
      "and the summary says how many",
    );
  });
});

describe("the MCP audit tool can be given the roots", () => {
  it("87 RED then GREEN: cedulon_audit accepts the pins, so its answer can be unconditional", () => {
    // The tool called audit() with no roots at all, so every answer it could
    // give was conditional and no caller had any way to change that.
    const statePath = join(mkdtempSync(join(tmpdir(), "cedulon-mcpaudit-")), "state.json");
    const session = new CedulonSession({ statePath });
    assert.equal(spend(session, "t0", 1).ok, true);

    const unpinned = session.audit();
    assert.equal(unpinned.guarantee, "conditional");
    assert.ok(unpinned.warnings.some((w) => w.code === "unauthenticated-issuer"));

    const pinned = session.audit({ issuerTrust: { publicKeyPem: session.keys.receiptPublicPem } });
    assert.equal(
      pinned.warnings.some((w) => w.code === "unauthenticated-issuer"),
      false,
      "a caller that holds the issuer key can say so",
    );
    assert.deepEqual(pinned.findings.map((f) => f.code), []);
  });
});
