import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyEngine } from "@cedulon/core";
import { generateReceiptKeys } from "@cedulon/receipts";
import { gatedSettle } from "@cedulon/x402-adapter";

const POLICY = {
  maxAmount: 10n,
  maxCumulative: 100n,
  maxPayments: 10,
  windowMs: 60_000,
} as const;

const TTL_MS = 5_000;
const EVAL_AT = 1_000;

function issuerKeys() {
  const k = generateReceiptKeys();
  return { privateKeyPem: k.privateKeyPem, publicKeyPem: k.publicKeyPem, ttlMs: TTL_MS };
}

function receiptKeys() {
  const k = generateReceiptKeys();
  return { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem };
}

/** Expiry from a Decision Token the engine issues under the same TTL and eval time. */
function expiryFromEvaluate(nonce: string): number {
  const engine = new PolicyEngine(POLICY, undefined, issuerKeys());
  const decision = engine.evaluate({
    amount: 1n,
    currency: "USD",
    payee: "p",
    nonce: nonce.padEnd(16, "-"),
    nowMs: EVAL_AT,
  });
  if (!decision.allow || !decision.token) {
    throw new Error("expected a signed Decision Token");
  }
  return decision.token.claims.expiryMs;
}

describe("MUST-T6-7 settlement time vs Decision Token expiry", () => {
  it("settles at expiryMs: 200, receipt timestamp equals expiryMs", () => {
    const expiryMs = expiryFromEvaluate("probe-eq");
    assert.equal(expiryMs, EVAL_AT + TTL_MS);

    const engine = new PolicyEngine(POLICY, undefined, issuerKeys());
    const result = gatedSettle(
      engine,
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "p",
          nonce: "eq".padEnd(16, "-"),
          nowMs: EVAL_AT,
        },
        payer: "buyer",
        paymentHeader: "mock",
      },
      receiptKeys(),
      expiryMs,
    );

    assert.equal(result.status, 200);
    if (result.status !== 200) return;
    assert.equal(result.receipt.claims.timestampMs, expiryMs);
    assert.ok(
      result.receipt.claims.timestampMs <= expiryMs,
      "accepted receipt timestamp must stay inside token expiry",
    );
  });

  it("refuses one ms past expiryMs as decision-expired with no receipt", () => {
    const expiryMs = expiryFromEvaluate("probe-past");
    assert.equal(expiryMs, EVAL_AT + TTL_MS);

    const engine = new PolicyEngine(POLICY, undefined, issuerKeys());
    const result = gatedSettle(
      engine,
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "p",
          nonce: "past".padEnd(16, "-"),
          nowMs: EVAL_AT,
        },
        payer: "buyer",
        paymentHeader: "mock",
      },
      receiptKeys(),
      expiryMs + 1,
    );

    assert.equal(result.status, 402);
    if (result.status !== 402) return;
    assert.equal(result.reason, "decision-expired");
    assert.equal("receipt" in result && result.receipt, false);
  });
});
