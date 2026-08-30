import { canonical, PolicyEngine } from "@cedulon/core";
import {
  generateManifestKeys,
  sha256Hex,
  signManifest,
  type TradeManifestBody,
} from "@cedulon/manifest";
import {
  counterSign,
  generateReceiptKeys,
  makeDisputeBundle,
  verifyCounterSignature,
  verifyDisputeBundle,
  verifyReceipt,
} from "@cedulon/receipts";
import { gatedSettle } from "@cedulon/x402-adapter";

export function runDispute(nowMs = 1_700_000_000_000): {
  matchesAcceptance: boolean;
  bundleOk: boolean;
  countersignOk: boolean;
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
    ap2MandateHash: sha256Hex("mandate-demo"),
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
        nonce: "trade-1".padEnd(16, "-"),
        nowMs,
        tool: "spend",
      },
      payer: "buyer",
      manifest,
      // The buyer holds the seller's manifest key out of band; without it the
      // gate refuses rather than settling against terms it cannot attribute.
      manifestTrust: mkeys.publicKeyPem,
      paymentHeader: "mock",
    },
    { receiptPrivatePem: rkeys.privateKeyPem, receiptPublicPem: rkeys.publicKeyPem },
    nowMs,
  );
  if (paid.status !== 200) {
    throw new Error(paid.reason);
  }
  // The demo holds the issuer key it just used, so it checks against that rather
  // than against the key the receipt carries - the same discipline the docs ask a
  // verifier for.
  if (!verifyReceipt(paid.receipt, rkeys.publicKeyPem)) {
    throw new Error("receipt");
  }
  const payeeKeys = generateReceiptKeys();
  const countersigned = counterSign(
    paid.receipt,
    payeeKeys.privateKeyPem,
    payeeKeys.publicKeyPem,
    rkeys.publicKeyPem,
  );
  if (!verifyCounterSignature(countersigned)) {
    throw new Error("countersign");
  }
  const bundle = makeDisputeBundle({
    manifestCanonical: canonical(manifest),
    receiptCanonical: canonical(countersigned),
    deliveryBytes: delivered,
    acceptanceCriteriaHash: body.acceptanceCriteriaHash,
  });
  return {
    matchesAcceptance: bundle.matchesAcceptance,
    bundleOk: verifyDisputeBundle(bundle) && bundle.matchesAcceptance === false,
    countersignOk:
      verifyCounterSignature(countersigned, payeeKeys.publicKeyPem) &&
      verifyReceipt(countersigned, rkeys.publicKeyPem),
  };
}
