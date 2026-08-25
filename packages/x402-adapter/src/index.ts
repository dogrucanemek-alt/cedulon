import {
  failClosedEvaluate,
  naivePayAlwaysAllow,
  policyDocument,
  type PolicyEngine,
  type SpendRequest,
} from "@cedulon/core";
import { canonical } from "@cedulon/core";
import {
  isManifestExpired,
  manifestHash,
  sha256Hex,
  verifyManifest,
  type SignedManifest,
} from "@cedulon/manifest";
import {
  signReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";

export type AdapterKeys = {
  receiptPrivatePem: string;
  receiptPublicPem: string;
};

export type PayInput = {
  req: SpendRequest;
  payer: string;
  manifest?: SignedManifest;
  paymentHeader?: string;
};

export type PayResult =
  | {
      status: 402;
      reason: string;
      headers: { "PAYMENT-REQUIRED": string };
    }
  | {
      status: 200;
      receipt: SignedReceipt;
      headers: { "PAYMENT-RESPONSE": string };
    };

function requiredEnvelope(req: SpendRequest): string {
  return Buffer.from(
    canonical({
      scheme: "exact",
      amount: req.amount.toString(),
      currency: req.currency,
      payTo: req.payee,
    }),
    "utf8",
  ).toString("base64");
}

export function deny402(req: SpendRequest, reason: string): PayResult {
  return {
    status: 402,
    reason,
    headers: { "PAYMENT-REQUIRED": requiredEnvelope(req) },
  };
}

export function challenge(req: SpendRequest): PayResult {
  return deny402(req, "payment-required");
}

export function unguardedSettle(input: PayInput, keys: AdapterKeys, nowMs: number): PayResult {
  const naive = naivePayAlwaysAllow(null, input.req);
  if (!naive.allow) {
    return challenge(input.req);
  }
  return issue(input, keys, nowMs, "unguarded");
}

export function gatedSettle(
  engine: PolicyEngine | null,
  input: PayInput,
  keys: AdapterKeys,
  nowMs: number,
  prevReceiptHash: string | null = null,
): PayResult {
  if (!input.paymentHeader) {
    return challenge(input.req);
  }

  if (input.manifest) {
    if (!verifyManifest(input.manifest)) {
      return deny402(input.req, "manifest-bad-sig");
    }
    if (isManifestExpired(input.manifest, nowMs)) {
      return deny402(input.req, "expired-manifest");
    }
    if (
      input.manifest.body.amount !== input.req.amount.toString() ||
      input.manifest.body.currency !== input.req.currency
    ) {
      return deny402(input.req, "manifest-mismatch");
    }
    input.req.manifestHash = manifestHash(input.manifest);
  }

  const decision = failClosedEvaluate(engine, input.req);
  if (!decision.allow) {
    return deny402(input.req, decision.reason);
  }
  if (engine) {
    const consumed = engine.consumeDecision(decision.decisionId, decision.requestHash, input.req);
    if (!consumed.allow) {
      return deny402(input.req, consumed.reason);
    }
  }
  return issue(input, keys, nowMs, `x402-${input.req.nonce}`, prevReceiptHash, engine);
}

function issue(
  input: PayInput,
  keys: AdapterKeys,
  nowMs: number,
  x402Ref: string,
  prevReceiptHash: string | null = null,
  engine: PolicyEngine | null = null,
): PayResult {
  const policyHash = engine
    ? sha256Hex(canonical(policyDocument(engine.policy)))
    : sha256Hex("no-policy");
  const receipt = signReceipt(
    {
      payer: input.payer,
      payee: input.req.payee,
      amount: input.req.amount.toString(),
      currency: input.req.currency,
      policyHash,
      manifestHash: input.manifest ? manifestHash(input.manifest) : null,
      noManifest: !input.manifest,
      x402PaymentRef: x402Ref,
      timestampMs: nowMs,
      nonce: input.req.nonce,
      prevReceiptHash,
    },
    keys.receiptPrivatePem,
    keys.receiptPublicPem,
  );
  return {
    status: 200,
    receipt,
    headers: {
      "PAYMENT-RESPONSE": Buffer.from(canonical(receipt.claims), "utf8").toString("base64"),
    },
  };
}
