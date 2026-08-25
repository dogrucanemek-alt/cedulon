import { canonical, PolicyEngine } from "@agent-trade-protocol/core";
import {
  generateManifestKeys,
  sha256Hex,
  signManifest,
  type TradeManifestBody,
} from "@agent-trade-protocol/manifest";
import {
  generateReceiptKeys,
  makeDisputeBundle,
  verifyDisputeBundle,
  verifyReceipt,
} from "@agent-trade-protocol/receipts";
import { gatedSettle } from "@agent-trade-protocol/x402-adapter";

export function runDispute(nowMs = 1_700_000_000_000): {
  matchesAcceptance: boolean;
  bundleOk: boolean;
} {
  const expected = Buffer.from("good-bytes");
  const delivered = Buffer.from("bad-bytes");
  const body: TradeManifestBody = {
    description: "dataset-v1",
    amount: "5",
    currency: "USD",
    acceptanceCriteriaHash: sha256Hex(expected),
    cancelCondition: "before-delivery",
    expiresAtMs: nowMs + 60_000,
    ap2MandateHash: "mandate-demo",
  };
  const mkeys = generateManifestKeys();
  const manifest = signManifest(body, mkeys.privateKeyPem, mkeys.publicKeyPem);
  const engine = new PolicyEngine({
    maxAmount: 5n,
    maxCumulative: 5n,
    maxPayments: 1,
    windowMs: 3_600_000,
    allowedPayees: ["seller"],
    allowedCurrencies: ["USD"],
  });
  const rkeys = generateReceiptKeys();
  const paid = gatedSettle(
    engine,
    {
      req: {
        amount: 5n,
        currency: "USD",
        payee: "seller",
        nonce: "trade-1",
        nowMs,
        tool: "spend",
      },
      payer: "buyer",
      manifest,
      paymentHeader: "mock",
    },
    { receiptPrivatePem: rkeys.privateKeyPem, receiptPublicPem: rkeys.publicKeyPem },
    nowMs,
  );
  if (paid.status !== 200) {
    throw new Error(paid.reason);
  }
  if (!verifyReceipt(paid.receipt)) {
    throw new Error("receipt");
  }
  const bundle = makeDisputeBundle({
    manifestCanonical: canonical(manifest),
    receiptCanonical: canonical(paid.receipt),
    deliveryBytes: delivered,
    acceptanceCriteriaHash: body.acceptanceCriteriaHash,
  });
  return {
    matchesAcceptance: bundle.matchesAcceptance,
    bundleOk: verifyDisputeBundle(bundle) && bundle.matchesAcceptance === false,
  };
}
