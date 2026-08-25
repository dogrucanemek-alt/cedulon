import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyEngine } from "@cedulon/core";
import { generateManifestKeys, signManifest, verifyManifest } from "@cedulon/manifest";
import { generateReceiptKeys, verifyReceipt } from "@cedulon/receipts";
import { gatedSettle } from "@cedulon/x402-adapter";

describe("replay and manifest expiry", () => {
  it("rejects reused nonce", () => {
    const e = new PolicyEngine({
      maxAmount: 10n,
      maxCumulative: 100n,
      maxPayments: 5,
      windowMs: 1000,
    });
    const first = e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "p",
      nonce: "same",
      nowMs: 1,
    });
    const second = e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "p",
      nonce: "same",
      nowMs: 1,
    });
    assert.equal(first.allow, true);
    assert.equal(second.allow, false);
    assert.equal(second.reason, "replay-nonce");
  });

  it("adapter denies expired manifest", () => {
    const nowMs = 1000;
    const mk = generateManifestKeys();
    const manifest = signManifest(
      {
        description: "g",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: "00",
        cancelCondition: "x",
        expiresAtMs: 500,
      },
      mk.privateKeyPem,
      mk.publicKeyPem,
    );
    const engine = new PolicyEngine({
      maxAmount: 10n,
      maxCumulative: 10n,
      maxPayments: 3,
      windowMs: 10_000,
    });
    const rk = generateReceiptKeys();
    const result = gatedSettle(
      engine,
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "p",
          nonce: "m1",
          nowMs,
        },
        payer: "buyer",
        manifest,
        paymentHeader: "mock",
      },
      { receiptPrivatePem: rk.privateKeyPem, receiptPublicPem: rk.publicKeyPem },
      nowMs,
    );
    assert.equal(result.status, 402);
    if (result.status === 402) {
      assert.equal(result.reason, "expired-manifest");
    }
  });

  it("adapter denies manifest amount mismatch", () => {
    const nowMs = 1000;
    const mk = generateManifestKeys();
    const manifest = signManifest(
      {
        description: "g",
        amount: "2",
        currency: "USD",
        acceptanceCriteriaHash: "00",
        cancelCondition: "x",
        expiresAtMs: 5000,
      },
      mk.privateKeyPem,
      mk.publicKeyPem,
    );
    const engine = new PolicyEngine({
      maxAmount: 10n,
      maxCumulative: 10n,
      maxPayments: 3,
      windowMs: 10_000,
    });
    const rk = generateReceiptKeys();
    const result = gatedSettle(
      engine,
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "p",
          nonce: "m2",
          nowMs,
        },
        payer: "buyer",
        manifest,
        paymentHeader: "mock",
      },
      { receiptPrivatePem: rk.privateKeyPem, receiptPublicPem: rk.publicKeyPem },
      nowMs,
    );
    assert.equal(result.status, 402);
    if (result.status === 402) {
      assert.equal(result.reason, "manifest-mismatch");
    }
  });

  it("no-manifest payment is flagged on receipt", () => {
    const nowMs = 1000;
    const engine = new PolicyEngine({
      maxAmount: 10n,
      maxCumulative: 10n,
      maxPayments: 3,
      windowMs: 10_000,
    });
    const rk = generateReceiptKeys();
    const result = gatedSettle(
      engine,
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "p",
          nonce: "nm",
          nowMs,
        },
        payer: "buyer",
        paymentHeader: "mock",
      },
      { receiptPrivatePem: rk.privateKeyPem, receiptPublicPem: rk.publicKeyPem },
      nowMs,
    );
    assert.equal(result.status, 200);
    if (result.status === 200) {
      assert.equal(result.receipt.claims.noManifest, true);
      assert.equal(result.receipt.claims.manifestHash, null);
      assert.equal(verifyReceipt(result.receipt), true);
    }
  });

  it("missing payment header returns 402", () => {
    const engine = new PolicyEngine({
      maxAmount: 10n,
      maxCumulative: 10n,
      maxPayments: 1,
      windowMs: 1000,
    });
    const rk = generateReceiptKeys();
    const result = gatedSettle(
      engine,
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "p",
          nonce: "h",
          nowMs: 1,
        },
        payer: "b",
      },
      { receiptPrivatePem: rk.privateKeyPem, receiptPublicPem: rk.publicKeyPem },
      1,
    );
    assert.equal(result.status, 402);
  });

  it("verifyManifest accepts a fresh signature", () => {
    const mk = generateManifestKeys();
    const signed = signManifest(
      {
        description: "g",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: "00",
        cancelCondition: "x",
        expiresAtMs: 9,
      },
      mk.privateKeyPem,
      mk.publicKeyPem,
    );
    assert.equal(verifyManifest(signed), true);
  });
});
