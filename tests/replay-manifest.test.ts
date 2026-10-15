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
      nonce: "same".padEnd(16, "-"),
      nowMs: 1,
    });
    const second = e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "p",
      nonce: "same".padEnd(16, "-"),
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
        acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
          nonce: "m1".padEnd(16, "-"),
          nowMs,
        },
        payer: "buyer",
        manifest,
        manifestTrust: mk.publicKeyPem,
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
        acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
          nonce: "m2".padEnd(16, "-"),
          nowMs,
        },
        payer: "buyer",
        manifest,
        manifestTrust: mk.publicKeyPem,
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

  it("RED then GREEN: a manifest that names a payee is refused for a payment to anyone else", () => {
    // The gate compared amount and currency with the manifest and not the
    // payee it names (MUST-T8-9). Terms published for one payee settled a
    // payment to another, and the receipt carried the hash of terms that
    // never named the party it paid.
    const nowMs = 1000;
    const mk = generateManifestKeys();
    const body = {
      description: "g",
      amount: "1",
      currency: "USD",
      acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      cancelCondition: "x",
      expiresAtMs: 5000,
    };
    const named = signManifest({ ...body, payee: "payee-A" }, mk.privateKeyPem, mk.publicKeyPem);
    const unnamed = signManifest(body, mk.privateKeyPem, mk.publicKeyPem);
    const rk = generateReceiptKeys();
    const keys = { receiptPrivatePem: rk.privateKeyPem, receiptPublicPem: rk.publicKeyPem };
    const pay = (manifest: typeof named, payee: string, n: string) =>
      gatedSettle(
        new PolicyEngine({ maxAmount: 10n, maxCumulative: 10n, maxPayments: 3, windowMs: 10_000 }),
        {
          req: { amount: 1n, currency: "USD", payee, nonce: n.padEnd(16, "-"), nowMs },
          payer: "buyer",
          manifest,
          manifestTrust: mk.publicKeyPem,
          paymentHeader: "mock",
        },
        keys,
        nowMs,
      );

    const other = pay(named, "payee-B", "pay-other");
    assert.equal(other.status, 402, "a payment to payee-B settled on terms that name payee-A");
    if (other.status === 402) {
      assert.equal(other.reason, "manifest-mismatch");
    }
    assert.equal(pay(named, "payee-A", "pay-named").status, 200);
    // A manifest that names no payee leaves the payee to the request, as before.
    assert.equal(pay(unnamed, "payee-B", "pay-unnamed").status, 200);
  });

  it("noManifest payment is flagged on receipt", () => {
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
          nonce: "nm".padEnd(16, "-"),
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
          nonce: "h".padEnd(16, "-"),
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
        acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        cancelCondition: "x",
        expiresAtMs: 9,
      },
      mk.privateKeyPem,
      mk.publicKeyPem,
    );
    assert.equal(verifyManifest(signed), true);
  });
});
