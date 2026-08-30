import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { hashClaimRefusal, isValidHashText, malformedHashCode } from "@cedulon/core";
import { decodeCbor } from "@cedulon/cose";
import {
  RECEIPT_CLAIM,
  claimsFromCbor,
  claimsToCbor,
  generateReceiptKeys,
  signReceipt,
  type SpendReceiptClaims,
} from "@cedulon/receipts";
import { decode as decodeCborX } from "cbor-x";

import { TEST_HASH } from "./hash-fixtures.ts";

const BASE: SpendReceiptClaims = {
  payer: "payer-1",
  payee: "payee-1",
  amount: "1",
  currency: "USD",
  policyHash: TEST_HASH,
  manifestHash: null,
  noManifest: true,
  x402PaymentRef: null,
  timestampMs: 1_700_000_000_000,
  nonce: "n1".padEnd(16, "0"),
  prevReceiptHash: null,
  outcome: "aborted",
};

describe("hash claim grammar (Table 3/5/7)", () => {
  it("RED then GREEN: only 64-character lowercase hex is in grammar", () => {
    assert.equal(isValidHashText(TEST_HASH), true);
    assert.equal(isValidHashText("AA"), false);
    assert.equal(isValidHashText("aa"), false);
    assert.equal(isValidHashText("g".repeat(64)), false);
    assert.equal(isValidHashText(TEST_HASH.toUpperCase()), false);
    assert.equal(hashClaimRefusal("policyHash", "AA"), "malformed-policy-hash");
    assert.equal(hashClaimRefusal("policyHash", "aa"), "malformed-policy-hash");
    assert.equal(hashClaimRefusal("manifestHash", null, true), null);
    assert.equal(malformedHashCode("acceptanceCriteriaHash"), "malformed-acceptance-criteria-hash");
    assert.equal(malformedHashCode("prevReceiptHash"), "malformed-prev-receipt-hash");
    assert.equal(malformedHashCode("chainHeadHash"), "malformed-chain-head-hash");
    assert.equal(malformedHashCode("prevCheckpointHash"), "malformed-prev-checkpoint-hash");
    assert.equal(malformedHashCode("ap2MandateHash"), "malformed-ap-two-mandate-hash");
    assert.equal(malformedHashCode("requestHash"), "malformed-request-hash");
    assert.equal(malformedHashCode("receiptHash"), "malformed-receipt-hash");
    assert.equal(malformedHashCode("manifestHash"), "malformed-manifest-hash");
    assert.equal(malformedHashCode("deliveredHash"), "malformed-delivered-hash");
  });

  it("RED then GREEN: the signer refuses uppercase, short, and non-hex by name", () => {
    const k = generateReceiptKeys();
    for (const bad of ["AA", "aa", "not-a-hash"]) {
      assert.throws(
        () => signReceipt({ ...BASE, policyHash: bad }, k.privateKeyPem, k.publicKeyPem),
        /malformed-policy-hash/,
        `policyHash ${JSON.stringify(bad)} must be refused`,
      );
    }
    assert.doesNotThrow(() => signReceipt(BASE, k.privateKeyPem, k.publicKeyPem));
  });

  it("RED then GREEN: the decoder still preserves a short tstr (cose.test.ts:138)", () => {
    const encoded = claimsToCbor({ ...BASE, policyHash: "aa" });
    const foreign = decodeCborX(Buffer.from(encoded)) as Record<string | number, unknown>;
    assert.equal(foreign[RECEIPT_CLAIM.policyHash], "aa");
    const roundTrip = claimsFromCbor(encoded);
    assert.equal(roundTrip.policyHash, "aa");
    assert.equal(decodeCbor(encoded) !== null, true);
  });
});
