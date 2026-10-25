import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, checkPresentedForm } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import {
  counterSign,
  generateReceiptKeys,
  signReceipt,
  verifyCounterSignature,
  verifyReceipt,
  verifyReceiptJson,
  verifyReceiptUnderPin,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

import { TEST_HASH } from "./hash-fixtures.ts";

/**
 * MUST-T4-1 signs a Spend Receipt over deterministic CBOR, and receiptHash is
 * defined only over COSE octets. The JSON encoding the receipts package still
 * offers has no receiptHash in the text, and on master 9baaad2 a JSON receipt
 * whose signature lost its base64 padding verified, hashed differently and
 * passed audit() without a word: one signed receipt, two identities. The
 * profile's verifiers now take COSE only; the legacy JSON helpers stay for
 * callers who use them directly, and no longer accept a second spelling.
 */
const S = 1_700_000_000_000;
const E = S + 3_600_000;
const issuer = generateReceiptKeys();
const rail = generateExtractKeys();

function claims(nonce: string) {
  return {
    payer: "payer",
    payee: "payee-1",
    amount: "1",
    currency: "USD",
    policyHash: TEST_HASH,
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: `ref-${nonce}`,
    // Mid-window, away from the profile's 300000 ms edge allowance, so an
    // uncovered row is settlement-without-receipt rather than deferred.
    timestampMs: S + 1_800_000,
    nonce: nonce.padEnd(16, "-"),
    prevReceiptHash: null,
    outcome: "settled" as const,
  };
}

const jsonReceipt = (): SignedReceipt => signReceipt(claims("co-json"), issuer.privateKeyPem, issuer.publicKeyPem, "json");
const coseReceipt = (): SignedReceipt => signReceipt(claims("co-cose"), issuer.privateKeyPem, issuer.publicKeyPem);

function auditOne(receipt: SignedReceipt, pinIssuer: boolean) {
  const checkpoint = signCheckpoint(buildCheckpointClaims(1, [receipt], S, E, null), issuer.privateKeyPem, issuer.publicKeyPem);
  const extract = signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: S,
      windowEndMs: E,
      settlements: [{ ref: receipt.claims.x402PaymentRef!, amount: "1", currency: "USD", timestampMs: S + 1_800_000 }],
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
  return audit({
    receipts: [receipt],
    checkpoints: [checkpoint],
    extract,
    trust: { publicKeyPem: rail.publicKeyPem, accountId: "acct", railId: "rail", windowStartMs: S, windowEndMs: E },
    ...(pinIssuer ? { issuerTrust: { publicKeyPem: issuer.publicKeyPem } } : {}),
  });
}

describe("the profile's verifiers take a COSE Spend Receipt only (MUST-T4-1)", () => {
  it("verifyReceipt refuses a JSON receipt, with or without an expected key", () => {
    const r = jsonReceipt();
    assert.equal(r.encoding, "json");
    assert.equal(verifyReceipt(r), false);
    assert.equal(verifyReceipt(r, issuer.publicKeyPem), false);
    assert.equal(verifyReceipt(coseReceipt(), issuer.publicKeyPem), true);
  });

  it("verifyReceiptUnderPin refuses a JSON receipt, so it cannot attest under a pin either", () => {
    assert.equal(verifyReceiptUnderPin(jsonReceipt(), issuer.publicKeyPem), false);
    assert.equal(verifyReceiptUnderPin(coseReceipt(), issuer.publicKeyPem), true);
  });

  it("the legacy verifyReceiptJson still verifies what signReceiptJson made, and only that spelling", () => {
    const r = jsonReceipt();
    assert.equal(verifyReceiptJson(r), true);
    // 64 signature octets are 88 base64 characters, two of them padding.
    assert.match(r.signature, /==$/);
    assert.equal(verifyReceiptJson({ ...r, signature: r.signature.replace(/=+$/, "") }), false);
    const urlSafe = r.signature.replace(/\+/g, "-").replace(/\//g, "_");
    if (urlSafe !== r.signature) {
      assert.equal(verifyReceiptJson({ ...r, signature: urlSafe }), false);
    }
    assert.equal(verifyReceiptJson({ ...r, signature: ` ${r.signature}` }), false);
  });

  for (const pinIssuer of [true, false]) {
    it(`audit() covers no settlement with a JSON receipt and names the refusal (${pinIssuer ? "issuer pinned" : "no issuer pin"})`, () => {
      const r = jsonReceipt();
      const report = auditOne(r, pinIssuer);
      assert.equal(report.ok, false);
      assert.ok(
        report.findings.some((f) => f.code === "settlement-without-receipt" && f.id === r.claims.x402PaymentRef),
        JSON.stringify(report.findings),
      );
      const named = report.findings.find((f) => f.id === r.claims.nonce && /receipt-not-cose/.test(f.detail));
      assert.ok(named, `no finding on nonce=${r.claims.nonce} names receipt-not-cose: ${JSON.stringify(report.findings)}`);
      assert.match(named.detail, /MUST-T4-1/);
    });
  }

  it("with no extract and no issuer pin, a JSON receipt still covers no settlement row", () => {
    const r = jsonReceipt();
    const report = audit({
      receipts: [r],
      checkpoints: [],
      settlements: [{ ref: r.claims.x402PaymentRef!, amount: "1", currency: "USD", timestampMs: S + 1_800_000 }],
    });
    assert.ok(
      report.findings.some((f) => f.code === "settlement-without-receipt" && f.id === r.claims.x402PaymentRef),
      JSON.stringify(report.findings),
    );
    assert.equal(report.counts.receipts.inScope, 0, JSON.stringify(report.counts));
    assert.equal(report.counts.receipts.matched, 0, JSON.stringify(report.counts));
    assert.ok(report.findings.some((f) => f.id === r.claims.nonce && /receipt-not-cose/.test(f.detail)));
  });

  it("a countersignature does not verify on a receipt whose encoding is not cose", () => {
    const payee = generateReceiptKeys();
    const signed = counterSign(coseReceipt(), payee.privateKeyPem, payee.publicKeyPem, issuer.publicKeyPem);
    assert.equal(verifyCounterSignature(signed, payee.publicKeyPem), true);
    assert.equal(verifyCounterSignature({ ...signed, encoding: "json" }, payee.publicKeyPem), false);
  });

  it("the same audit with the COSE receipt balances", () => {
    const report = auditOne(coseReceipt(), true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.ok, true);
  });

  it("checkPresentedForm reports a JSON receipt once, as bad-encoding", () => {
    const r = jsonReceipt();
    assert.deepEqual(
      checkPresentedForm({ receipts: [r], checkpoints: [] }),
      [{ object: "receipts[0]", member: "encoding", problem: "bad-encoding" }],
    );
  });
});
