import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  signCheckpoint,
  verifyCheckpoint,
  verifyInclusionReceipt,
} from "@cedulon/checkpoint";
import { signDecisionToken, verifyDecisionToken } from "@cedulon/core";
import {
  generateReceiptKeys,
  receiptHash,
  signReceipt,
  verifyReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(
  keys: Keys,
  ref: string,
  amount: string,
  i: number,
  prev: string | null = null,
): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee",
      amount,
      currency: "USD",
      policyHash: TEST_HASH,
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

function checkpointFor(keys: Keys, receipts: SignedReceipt[]) {
  return signCheckpoint(
    buildCheckpointClaims(1, receipts, NOW, WINDOW_END, null),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

/** A rail extract carrying one authorised row and one unauthorised one. */
function railWith(rail: Keys, settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }>) {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
      clockSkewMs: 0,
      settlements,
    },
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

describe("issuer trust root", () => {
  it("32 RED then GREEN: a receipt signed by a foreign key cannot silence a settlement finding", () => {
    // The lesson MUST-T10-8 states for the rail extract - verify against a key
    // supplied out of band, not against the one the object carries - applies to
    // every signed object in the audit. Without it an attacker who never touches
    // the honest key mints their own, signs a receipt for the unauthorised row
    // and a checkpoint that agrees with it, and the report comes back clean.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();

    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [
      { ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW },
      { ref: "ref-evil", amount: "500", currency: "USD", timestampMs: NOW + 1 },
    ]);

    const baseline = audit({
      receipts: [good],
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.equal(
      baseline.findings.filter((f) => f.code === "settlement-without-receipt").length,
      1,
      "the unauthorised settlement is naked before the forgery",
    );

    const forged = receiptFor(attacker, "ref-evil", "500", 1, receiptHash(good));
    const receipts = [good, forged];
    const after = audit({
      receipts,
      checkpoints: [checkpointFor(attacker, receipts)],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });

    // A receipt that does not answer to the pinned issuer is not coverage, so
    // the settlement it claims to cover stays naked.
    assert.equal(
      after.findings.filter((f) => f.code === "settlement-without-receipt").length,
      1,
      "a foreign key must not count as coverage",
    );
    assert.ok(
      after.findings.some((f) => f.code === "issuer-key-mismatch" && f.id === forged.claims.nonce),
      "the forged receipt is named",
    );
    assert.ok(
      after.findings.some((f) => f.code === "issuer-key-mismatch" && f.id.startsWith("epoch-")),
      "the checkpoint signed by the same foreign key is named too",
    );
    assert.equal(after.ok, false);
  });

  it("33 RED then GREEN: honest objects under a stated issuer key reach an unconditional guarantee", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);

    const green = audit({
      receipts: [good],
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.equal(green.findings.length, 0, green.findings.map((f) => f.code).join(","));
    assert.equal(green.guarantee, "unconditional");
  });

  it("34 RED then GREEN: an audit with no issuer key says so instead of claiming coverage", () => {
    // Pinning the rail says who reported the settlements. It says nothing about
    // who issued the receipts, so an audit without an issuer key has checked
    // internal consistency only and must not describe itself as unconditional.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);

    const report = audit({
      receipts: [good],
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
    });
    assert.equal(report.findings.length, 0, "an unpinned issuer is a warning, not a failure");
    assert.ok(
      report.warnings.some((w) => w.code === "unauthenticated-issuer" && w.severity === "warn"),
      "the missing issuer key is named in the report",
    );
    assert.equal(report.guarantee, "conditional");

    // An audit with nothing issued rests on the extract alone, so the missing
    // issuer key is not a gap in it. A warning nobody can act on is noise.
    const nothingIssued = audit({
      receipts: [],
      checkpoints: [],
      extract: railWith(rail, []),
      trust: railPin(rail),
    });
    assert.equal(
      nothingIssued.warnings.some((w) => w.code === "unauthenticated-issuer"),
      false,
    );
    assert.equal(nothingIssued.guarantee, "unconditional");
  });

  it("35 RED then GREEN: an unreadable issuer pin blames the configuration, not the receipts", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);

    const report = audit({
      receipts: [good],
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: "not a key" },
    });
    assert.ok(
      report.findings.some((f) => f.code === "trust-key-unreadable" && f.id === "issuer"),
      "an operator can tell a broken setting from a forged receipt",
    );
    assert.equal(
      report.findings.some((f) => f.code === "issuer-key-mismatch"),
      false,
      "a key we could not read is not evidence against the receipt",
    );
  });

  it("42 RED then GREEN: an inclusion receipt is checked against the witness key, and against its own signed fields", () => {
    // Same loop, third place: the witness receipt was verified against the key
    // it carries, so anyone could sign "your checkpoint is in my log". The
    // signed payload also carries index and treeHead, and only statementHash
    // was compared - the outer object could disagree with the bytes it signs.
    const honest = generateReceiptKeys();
    const witness = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const cp = checkpointFor(honest, [good]);

    const log = new MemoryTransparencyService(witness);
    const inc = anchorCheckpoint(log, cp);
    assert.equal(verifyInclusionReceipt(inc), true);
    assert.equal(verifyInclusionReceipt(inc, witness.publicKeyPem), true);
    assert.equal(
      verifyInclusionReceipt(inc, attacker.publicKeyPem),
      false,
      "a log we never named cannot vouch for the checkpoint",
    );

    const forgedLog = new MemoryTransparencyService(attacker);
    const forged = anchorCheckpoint(forgedLog, cp);
    assert.equal(verifyInclusionReceipt(forged), true, "it is internally consistent, as always");
    assert.equal(verifyInclusionReceipt(forged, witness.publicKeyPem), false);

    // The envelope must not be able to claim a position the signature does not.
    assert.equal(verifyInclusionReceipt({ ...inc, index: inc.index + 1 }, witness.publicKeyPem), false);
    assert.equal(verifyInclusionReceipt({ ...inc, treeHead: "0".repeat(64) }, witness.publicKeyPem), false);
  });

  it("36 RED then GREEN: verifyReceipt, verifyCheckpoint and verifyDecisionToken take a key to check against", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();

    const good = receiptFor(honest, "ref-ok", "1", 0);
    assert.equal(verifyReceipt(good), true, "the existing one-argument call keeps working");
    assert.equal(verifyReceipt(good, honest.publicKeyPem), true);
    assert.equal(verifyReceipt(good, attacker.publicKeyPem), false, "a foreign key fails the receipt");

    const cp = checkpointFor(honest, [good]);
    assert.equal(verifyCheckpoint(cp), true);
    assert.equal(verifyCheckpoint(cp, honest.publicKeyPem), true);
    assert.equal(verifyCheckpoint(cp, attacker.publicKeyPem), false);

    const token = signDecisionToken(
      {
        requestHash: TEST_HASH,
        policyHash: TEST_HASH,
        expiryMs: NOW + 60_000,
        nonce: "n0".padEnd(16, "-"),
        singleUseId: "single",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    assert.equal(verifyDecisionToken(token, NOW), true);
    assert.equal(verifyDecisionToken(token, NOW, honest.publicKeyPem), true);
    assert.equal(verifyDecisionToken(token, NOW, attacker.publicKeyPem), false);
  });
});
