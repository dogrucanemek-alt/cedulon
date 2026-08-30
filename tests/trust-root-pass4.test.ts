import { strict as assert } from "node:assert";
import { mkdtempSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  signCheckpoint,
} from "@cedulon/checkpoint";
import { PolicyEngine } from "@cedulon/core";
import { generateManifestKeys, signManifest } from "@cedulon/manifest";
import {
  counterSign,
  generateReceiptKeys,
  signReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, unguardedSettle } from "@cedulon/x402-adapter";

import { CedulonSession } from "../packages/mcp-server/src/session.ts";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(keys: Keys, ref: string, amount: string, i: number, prev: string | null = null): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee-1",
      amount,
      currency: "USD",
      policyHash: "policy-hash",
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: ref,
      timestampMs: NOW + i,
      nonce: `n${i}`.padEnd(16, "-"),
      prevReceiptHash: prev,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function checkpointFor(keys: Keys, receipts: SignedReceipt[], epoch = 1) {
  return signCheckpoint(
    buildCheckpointClaims(epoch, receipts, NOW, WINDOW_END, null),
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

describe("trust roots, fourth pass", () => {
  it("57 RED then GREEN: an issuer pin that cannot be read refuses coverage instead of granting it", () => {
    // A pin nothing could be read from left `attested` as the whole submitted
    // list, so a forged receipt counted as coverage again and the naked
    // settlement it pointed at went quiet. The report closed - on the wrong
    // reason. An unreadable configuration has to withhold trust, not hand it out.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const forged = receiptFor(attacker, "ref-evil", "500", 1);
    const extract = railWith(rail, [
      { ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW },
      { ref: "ref-evil", amount: "500", currency: "USD", timestampMs: NOW + 1 },
    ]);
    const base = {
      receipts: [good, forged],
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
    };

    for (const pin of [[], ["not-a-key"], [honest.publicKeyPem, "not-a-key"]]) {
      const report = audit({ ...base, issuerTrust: { publicKeyPem: pin } });
      assert.ok(
        report.findings.some((f) => f.code === "trust-key-unreadable" && f.id === "issuer"),
        `${JSON.stringify(pin)}: the broken configuration is named`,
      );
      assert.ok(
        report.findings.some((f) => f.code === "settlement-without-receipt"),
        `${JSON.stringify(pin)}: an unreadable pin must not let a forged receipt count as coverage`,
      );
    }

    // A readable key beside a broken one still does its job: the settlement it
    // covers stays covered, and only the row nothing attests is reported.
    const mixed = audit({
      ...base,
      issuerTrust: { publicKeyPem: [honest.publicKeyPem, "not-a-key"] },
    });
    assert.equal(
      mixed.findings.filter((f) => f.code === "settlement-without-receipt").length,
      1,
      "only the unattested row is naked",
    );
  });

  it("58 RED then GREEN: countersign and redaction findings read the attested set too", () => {
    // Two more inferences still walked the whole submitted list, so an object
    // the verifier had already rejected could still write into the report.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);

    // A receipt from a foreign key, carrying a countersignature of its own.
    const foreign = counterSign(
      receiptFor(attacker, "ref-evil", "1", 9),
      attacker.privateKeyPem,
      attacker.publicKeyPem,
      attacker.publicKeyPem,
    );
    // A checkpoint from a foreign key, published with its totals withheld.
    const foreignRedacted = signCheckpoint(
      { ...checkpointFor(attacker, [good], 2).claims, totals: null },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );

    const report = audit({
      receipts: [good, foreign],
      checkpoints: [checkpointFor(honest, [good]), foreignRedacted],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });

    assert.equal(
      report.warnings.some((w) => w.code === "unauthenticated-countersigner"),
      false,
      "a receipt nothing attests does not raise questions about its countersigner",
    );
    assert.equal(
      report.warnings.some((w) => w.code === "checkpoint-totals-redacted"),
      false,
      "a redaction is only meaningful from an issuer the verifier accepts",
    );
    assert.ok(report.findings.some((f) => f.code === "issuer-key-mismatch"));
  });

  it("59 RED then GREEN: a witness cannot report a checkpoint withheld on someone else's behalf", () => {
    // Equivocation already filtered the pool by issuer; the withheld check did
    // not. On a shared log, another issuer's statement made this issuer look
    // like it was hiding an epoch.
    const honest = generateReceiptKeys();
    const stranger = generateReceiptKeys();
    const witness = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const mine = checkpointFor(honest, [good], 1);
    const theirs = checkpointFor(stranger, [good], 5);

    const log = new MemoryTransparencyService(witness);
    const report = audit({
      receipts: [good],
      checkpoints: [mine],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: witness.publicKeyPem },
      inclusionReceipts: [anchorCheckpoint(log, mine), anchorCheckpoint(log, theirs)],
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
      "someone else's statement in a shared log is not this issuer withholding one",
    );
  });

  it("64 RED then GREEN: an inclusion receipt with no body cannot accuse anyone of withholding", () => {
    // The issuer filter reached for `r.checkpoint`, and passed anything that did
    // not carry one. Stripping the body off a genuine log entry is free, and the
    // honest issuer was reported for hiding an epoch that was never theirs. A
    // receipt that cannot say whose statement it binds cannot make that charge.
    const honest = generateReceiptKeys();
    const stranger = generateReceiptKeys();
    const witness = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const mine = checkpointFor(honest, [good], 1);
    const theirs = checkpointFor(stranger, [good], 5);

    const log = new MemoryTransparencyService(witness);
    const mineInclusion = anchorCheckpoint(log, mine);
    const { checkpoint: _stripped, ...bodyless } = anchorCheckpoint(log, theirs);

    const report = audit({
      receipts: [good],
      checkpoints: [mine],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: witness.publicKeyPem },
      inclusionReceipts: [mineInclusion, bodyless],
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
      "a body-less entry names no issuer, so it accuses no issuer",
    );
    // The anchoring evidence it does carry still counts: this checkpoint is
    // anchored, and saying otherwise would be its own false report.
    assert.equal(
      report.warnings.some((w) => w.code === "checkpoint-not-anchored"),
      false,
    );
  });

  it("60 RED then GREEN: state protection is measured on the file, not guessed from the platform", (t) => {
    // The claim was derived from process.platform, so on a mount that ignores
    // POSIX modes - a Windows drive seen from WSL - the server reported
    // owner-only over a world-readable file holding its private key.
    const statePath = join(mkdtempSync(join(tmpdir(), "cedulon-mode-")), "state.json");
    const session = new CedulonSession({ statePath });
    assert.equal(
      session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-") }, 1).ok,
      true,
    );

    if (process.platform === "win32") {
      assert.equal(session.status().stateProtection, "unprotected-on-this-platform");
      t.skip("chmod is not the access control on Windows; the unprotected report is asserted, the POSIX flip is not");
      return;
    }
    assert.equal(session.status().stateProtection, "owner-only");
    // A mount that ignores the mode is indistinguishable from a platform that
    // does, unless the claim is read back off the file.
    chmodSync(statePath, 0o777);
    assert.equal(session.status().stateProtection, "unprotected-on-this-platform");
  });

  it("61 RED then GREEN: a second writer cannot silently drop the first writer's receipt", () => {
    // Both sessions loaded the same state, both appended, and the later rename
    // won. Atomic writes stop a torn file; they do not stop a lost one.
    const statePath = join(mkdtempSync(join(tmpdir(), "cedulon-race-")), "state.json");
    const first = new CedulonSession({ statePath });
    assert.equal(
      first.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "seed".padEnd(16, "-") }, 1).ok,
      true,
    );

    const second = new CedulonSession({ statePath });
    assert.equal(
      second.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "two".padEnd(16, "-") }, 2).ok,
      true,
    );

    // `first` is now holding a view of the state that is no longer on disk. The
    // payment is refused before anything settles, rather than settled and then
    // failing to record - see case 78.
    const denied = first.spend(
      { amount: "1", currency: "USD", payee: "payee-1", nonce: "one".padEnd(16, "-") },
      3,
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false && denied.reason, "state-conflict");
    const onDisk = JSON.parse(readFileSync(statePath, "utf8"));
    assert.deepEqual(
      onDisk.receipts.map((r: SignedReceipt) => r.claims.nonce),
      ["seed".padEnd(16, "-"), "two".padEnd(16, "-")],
      "the other writer's work is still there",
    );
  });

  it("62 RED then GREEN: no path writes a manifest hash it never verified", () => {
    // gatedSettle checks the manifest; the unguarded path reached issue()
    // directly and recorded the hash of terms nobody had checked, into a receipt
    // that is otherwise perfectly real.
    const issuer = generateReceiptKeys();
    const attacker = generateManifestKeys();
    const merchant = generateManifestKeys();
    const keys = { receiptPrivatePem: issuer.privateKeyPem, receiptPublicPem: issuer.publicKeyPem };
    const body = {
      description: "one unit of work",
      amount: "1",
      currency: "USD",
      acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      cancelCondition: "none",
      expiresAtMs: NOW + 60_000,
    };
    const forged = signManifest(body, attacker.privateKeyPem, attacker.publicKeyPem);
    const input = {
      req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-"), nowMs: NOW },
      payer: "p",
      manifest: forged,
      paymentHeader: "mock",
    };

    const unpinned = unguardedSettle(input, keys, NOW);
    assert.equal(unpinned.status, 200, "the unguarded path is still the unguarded path");
    assert.equal(
      unpinned.receipt.claims.manifestHash !== null &&
        unpinned.receipt.claims.noManifest === false,
      true,
      "a manifest that verifies against its own key is still recorded, as before",
    );

    const pinned = unguardedSettle({ ...input, manifestTrust: merchant.publicKeyPem }, keys, NOW);
    assert.equal(pinned.status, 402);
    assert.equal(pinned.reason, "manifest-bad-sig");

    // A manifest whose own signature does not verify never reaches a receipt.
    // Flip the last byte rather than setting it: writing "00" over a byte that
    // was already zero leaves the signature intact, which made this test pass or
    // fail depending on the key it happened to generate.
    const rawManifest = Buffer.from(forged.coseHex, "hex");
    rawManifest[rawManifest.length - 1] ^= 0x01;
    const broken = { ...forged, coseHex: rawManifest.toString("hex") };
    const result = unguardedSettle({ ...input, manifest: broken }, keys, NOW);
    assert.equal(result.status, 402);
    assert.equal(result.reason, "manifest-bad-sig");
  });

  it("63 RED then GREEN: the verify tool says which key it was given, not whether it got both", () => {
    // One flag for two questions read as "nothing was checked" whenever either
    // key was missing, including when the issuer had in fact been checked.
    const issuer = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const receipt = receiptFor(issuer, "ref-ok", "1", 0);
    const countersigned = counterSign(receipt, payee.privateKeyPem, payee.publicKeyPem, issuer.publicKeyPem);
    const session = new CedulonSession({ statePath: null });

    const issuerOnly = session.verify({
      receipt: countersigned,
      expectIssuerKeyPem: issuer.publicKeyPem,
    });
    assert.equal(issuerOnly.issuerCheckedAgainstSuppliedKey, true);
    assert.equal(issuerOnly.payeeCheckedAgainstSuppliedKey, false);

    const both = session.verify({
      receipt: countersigned,
      expectIssuerKeyPem: issuer.publicKeyPem,
      expectPayeeKeyPem: payee.publicKeyPem,
    });
    assert.equal(both.issuerCheckedAgainstSuppliedKey, true);
    assert.equal(both.payeeCheckedAgainstSuppliedKey, true);
    assert.equal(both.ok, true);

    const noCounter = session.verify({ receipt, expectIssuerKeyPem: issuer.publicKeyPem });
    assert.equal(noCounter.issuerCheckedAgainstSuppliedKey, true);
    assert.equal(
      noCounter.payeeCheckedAgainstSuppliedKey,
      null,
      "there was no countersignature to check",
    );
  });
});
