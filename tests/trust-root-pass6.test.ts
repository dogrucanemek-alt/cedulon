import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  signCheckpoint,
} from "@cedulon/checkpoint";
import {
  counterSign,
  generateReceiptKeys,
  signReceipt,
  signReceiptUnchecked,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

import { CedulonSession } from "../packages/mcp-server/src/session.ts";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(
  keys: Keys,
  ref: string | null,
  i: number,
  prev: string | null = null,
): SignedReceipt {
  const claims = {
    payer: "payer",
    payee: "payee-1",
    amount: "1",
    currency: "USD",
    policyHash: TEST_HASH,
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: ref,
    timestampMs: NOW + i,
    nonce: `n${i}`.padEnd(16, "-"),
    prevReceiptHash: prev,
    outcome: "settled" as const,
  };
  return ref === null
    ? signReceiptUnchecked(claims, keys.privateKeyPem, keys.publicKeyPem)
    : signReceipt(claims, keys.privateKeyPem, keys.publicKeyPem);
}

function checkpointFor(keys: Keys, receipts: SignedReceipt[], epoch = 1, prev: string | null = null) {
  return signCheckpoint(
    buildCheckpointClaims(epoch, receipts, NOW, WINDOW_END, prev),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function railWith(
  rail: Keys,
  settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }>,
) {
  return signRailExtract(
    { accountId: "acct", railId: "rail", windowStartMs: NOW, windowEndMs: WINDOW_END, settlements },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function railPin(rail: Keys) {
  return {
    publicKeyPem: rail.publicKeyPem,
    accountId: "acct",
    railId: "rail",
    windowStartMs: NOW,
    windowEndMs: WINDOW_END,
  };
}

describe("trust roots, sixth pass", () => {
  it("72 RED then GREEN: a rejected receipt's own defect is still reported, under its own name", () => {
    // Scoping self-consistency to the accepted set stopped a foreign receipt from
    // writing `duplicate-ref` against an honest rail ref. It also silenced what
    // that receipt says about itself. The two are not the same question:
    // `duplicate-ref` is keyed by a ref the honest issuer also uses, while
    // `settled-without-ref` is keyed by the offending receipt's own nonce and
    // accuses nobody else.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", 0);
    const foreignNullRef = receiptFor(attacker, null, 7);
    const foreignSameRef = receiptFor(attacker, "ref-ok", 8);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const base = {
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    };

    const withNullRef = audit({ ...base, receipts: [good, foreignNullRef] });
    assert.ok(
      withNullRef.findings.some(
        (f) => f.code === "settled-without-ref" && f.id === foreignNullRef.claims.nonce,
      ),
      "a defect keyed by the offending receipt is reported whoever signed it",
    );

    const withSameRef = audit({ ...base, receipts: [good, foreignSameRef] });
    assert.equal(
      withSameRef.findings.some((f) => f.code === "duplicate-ref"),
      false,
      "a defect keyed by the honest issuer's own ref is not",
    );
  });

  it("73 RED then GREEN: a broken issuer pin does not cancel the payee expectation", () => {
    // The countersignature questions read the attested set, which an unreadable
    // pin empties - so naming a payee key and then mistyping the issuer key made
    // the expectation disappear rather than fail.
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const rail = generateExtractKeys();
    const plain = receiptFor(honest, "ref-ok", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const base = {
      receipts: [plain],
      checkpoints: [checkpointFor(honest, [plain])],
      extract,
      trust: railPin(rail),
      payeeTrust: { "payee-1": payee.publicKeyPem },
    };

    const usable = audit({ ...base, issuerTrust: { publicKeyPem: honest.publicKeyPem } });
    assert.ok(usable.warnings.some((w) => w.code === "countersign-missing"));

    const broken = audit({ ...base, issuerTrust: { publicKeyPem: "not-a-key" } });
    assert.ok(
      broken.warnings.some((w) => w.code === "countersign-missing"),
      "the verifier still stated it expects this payee's word",
    );
  });

  it("74 RED then GREEN: a log entry nobody can attribute is reported, not ignored", () => {
    // Requiring a body before an entry may accuse anyone closed one door and
    // quietly opened another: a real withholding goes silent as soon as the body
    // is stripped off the inclusion receipt. It cannot name who withheld, but it
    // can say that the log holds a statement this chain does not present.
    const honest = generateReceiptKeys();
    const witness = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const presented = checkpointFor(honest, [good], 1);
    const hidden = checkpointFor(honest, [good], 2);

    const log = new MemoryTransparencyService(witness);
    const presentedInclusion = anchorCheckpoint(log, presented);
    const { checkpoint: _body, ...strippedHidden } = anchorCheckpoint(log, hidden);

    const report = audit({
      receipts: [good],
      checkpoints: [presented],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: witness.publicKeyPem },
      inclusionReceipts: [presentedInclusion, strippedHidden],
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
      "still no accusation: the entry names no issuer",
    );
    const unattributable = report.warnings.find((w) => w.code === "witness-entry-unattributable");
    assert.ok(
      unattributable,
      "but the operator is told the log holds something this chain does not present",
    );
    assert.match(unattributable.detail, new RegExp(strippedHidden.statementHash));
    assert.equal(report.guarantee, "conditional");
  });

  it("75 RED then GREEN: owner-only means every directory on the way, not just the last one", () => {
    // Mode 0600 says who can open the file and the parent says who can replace
    // it - but a grandparent anyone can write lets the parent itself be renamed
    // away, taking the private key with it and putting a decoy in its place.
    if (process.platform === "win32") {
      const path = join(mkdtempSync(join(tmpdir(), "cedulon-grand-")), "state.json");
      const session = new CedulonSession({ statePath: path });
      assert.equal(
        session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-") }, 1).ok,
        true,
      );
      assert.equal(session.status().stateProtection, "encrypted-at-rest");
    } else {
      const grand = mkdtempSync(join(tmpdir(), "cedulon-grand-"));
      const parent = join(grand, "inner");
      mkdirSync(parent, { mode: 0o700 });
      const statePath = join(parent, "state.json");
      const session = new CedulonSession({ statePath });
      assert.equal(
        session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-") }, 1).ok,
        true,
      );
      assert.equal(session.status().stateProtection, "owner-only");

      chmodSync(grand, 0o777);
      assert.equal(
        session.status().stateProtection,
        "unprotected-on-this-platform",
        "whoever can write the grandparent can rename the parent out from under this file",
      );
    }
  });

  it("76 RED then GREEN: a symlink is refused when saving, and so is a symlinked directory", (t) => {
    // A path checked once at startup is a path an attacker can replace at any
    // point after startup, and the directory was never checked at all.
    const dir = mkdtempSync(join(tmpdir(), "cedulon-link2-"));
    const real = join(dir, "real");
    mkdirSync(real, { mode: 0o700 });
    const linkedDir = join(dir, "linked");
    try {
      symlinkSync(real, linkedDir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        if (process.platform === "win32") {
          t.skip("creating a directory symlink needs privilege on this host (Developer Mode off); measured on POSIX instead");
        }
        return;
      }
      throw err;
    }
    assert.throws(
      () => new CedulonSession({ statePath: join(linkedDir, "state.json") }),
      /cedulon-state-symlink/,
      "a symlinked directory decides the destination just as well as a symlinked file",
    );

    const plain = mkdtempSync(join(tmpdir(), "cedulon-link3-"));
    const statePath = join(plain, "state.json");
    const session = new CedulonSession({ statePath });
    assert.equal(
      session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-") }, 1).ok,
      true,
    );
    // The attacker replaces the file with a link after the session started.
    const elsewhere = join(plain, "elsewhere.json");
    writeFileSync(elsewhere, "{}\n", { mode: 0o600 });
    rmSync(statePath);
    symlinkSync(elsewhere, statePath);
    assert.throws(
      () => session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n1".padEnd(16, "-") }, 2),
      /cedulon-state-symlink/,
    );
  });

  it("77 RED then GREEN: a second writer is refused while the first holds the file", () => {
    // The fingerprint check reads and then writes, and two writers that read
    // before either wrote both saw an unchanged file. Measured over ten
    // concurrent pairs, six lost a receipt with both sides reporting success.
    // Holding the write behind an exclusive lock closes the window.
    const statePath = join(mkdtempSync(join(tmpdir(), "cedulon-lock-")), "state.json");
    const session = new CedulonSession({ statePath });
    assert.equal(
      session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-") }, 1).ok,
      true,
    );

    // Another live process is holding the lock. The parent of this test run is a
    // real, live pid that is not ours - a lock left by this very process is
    // treated as our own leftover and taken back, which is a different case.
    writeFileSync(`${statePath}.lock`, JSON.stringify({ pid: process.ppid }), { flag: "wx" });
    // Refused rather than thrown, and it names the holder - see case 84.
    const refused = session.spend(
      { amount: "1", currency: "USD", payee: "payee-1", nonce: "n1".padEnd(16, "-") },
      2,
    );
    assert.equal(refused.ok, false, "writing under another holder's lock is how the receipt went missing");
    assert.match(refused.ok === false ? refused.reason : "", /^state-locked:/);

    // A lock left behind by a process that is gone must not wedge the server.
    writeFileSync(`${statePath}.lock`, JSON.stringify({ pid: 0x7ffffffe }), { flag: "w" });
    assert.equal(
      session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n2".padEnd(16, "-") }, 3).ok,
      true,
      "a stale lock is taken over rather than obeyed forever",
    );
  });
});

describe("trust roots, seventh pass", () => {
  it("78 RED then GREEN: a payment is not made when its receipt cannot be recorded", () => {
    // The order was settle, then append, then save. A save that failed left the
    // rail ledger holding a settlement whose receipt existed only in memory -
    // restart the server and it is a settlement with no receipt, which is the
    // single condition this whole project exists to make impossible.
    const statePath = join(mkdtempSync(join(tmpdir(), "cedulon-order-")), "state.json");
    const first = new CedulonSession({ statePath });
    assert.equal(
      first.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "s0".padEnd(16, "-") }, 1).ok,
      true,
    );

    // A second server writes, so `first` is now holding a stale view.
    const second = new CedulonSession({ statePath });
    assert.equal(
      second.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "s1".padEnd(16, "-") }, 2).ok,
      true,
    );

    const ledgerBefore = first.ledger.extract().length;
    const receiptsBefore = first.receipts.length;
    const denied = first.spend(
      { amount: "1", currency: "USD", payee: "payee-1", nonce: "s2".padEnd(16, "-") },
      3,
    );
    assert.equal(denied.ok, false, "the payment is refused rather than half-made");
    assert.equal(denied.ok === false && denied.reason, "state-conflict");
    assert.equal(first.ledger.extract().length, ledgerBefore, "nothing settled on the rail");
    assert.equal(first.receipts.length, receiptsBefore, "and no receipt was appended");
  });

  it("79 RED then GREEN: a flood of unattributable log entries is one warning, not thousands", () => {
    // Entries with no body are free to produce. One warning each let an attacker
    // bury the real findings and drag an honest audit to conditional by volume.
    const honest = generateReceiptKeys();
    const witness = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const presented = checkpointFor(honest, [good], 1);

    const log = new MemoryTransparencyService(witness);
    const inclusions = [anchorCheckpoint(log, presented)];
    for (let i = 0; i < 50; i += 1) {
      const other = checkpointFor(honest, [good], 100 + i);
      const { checkpoint: _body, ...bodyless } = anchorCheckpoint(log, other);
      inclusions.push(bodyless);
    }

    const report = audit({
      receipts: [good],
      checkpoints: [presented],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: witness.publicKeyPem },
      inclusionReceipts: inclusions,
    });
    const unattributable = report.warnings.filter((w) => w.code === "witness-entry-unattributable");
    assert.equal(unattributable.length, 1, "one warning that counts them, not one per entry");
    assert.match(unattributable[0].detail, /50/, "and it says how many");
  });
});
