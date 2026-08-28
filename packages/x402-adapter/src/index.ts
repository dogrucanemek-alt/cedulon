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
  isValidNonce,
  signReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import { RailLedger, type RailSettlement } from "./rail.ts";

export {
  RailLedger,
  generateExtractKeys,
  signRailExtract,
  verifyRailExtract,
  type RailExtractBody,
  type RailSettlement,
  type SignedRailExtract,
} from "./rail.ts";

export type AdapterKeys = {
  receiptPrivatePem: string;
  receiptPublicPem: string;
};

export type PayInput = {
  req: SpendRequest;
  payer: string;
  manifest?: SignedManifest;
  paymentHeader?: string;
  /**
   * The key the caller holds for whoever was entitled to publish this manifest.
   * Without it the manifest is checked against the key it carries, so a payer
   * can present terms they minted and the receipt records their hash as if the
   * named party had authorised them.
   */
  manifestTrust?: string;
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

export function unguardedSettle(
  input: PayInput,
  keys: AdapterKeys,
  nowMs: number,
  ledger?: RailLedger,
): PayResult {
  const naive = naivePayAlwaysAllow(null, input.req);
  if (!naive.allow) {
    return challenge(input.req);
  }
  return issue(input, keys, nowMs, "unguarded", null, null, ledger);
}

/** Rail settles with no Cedulon receipt. The audit extract still lists it. */
export function bypassRailOnly(input: PayInput, nowMs: number, ledger: RailLedger): RailSettlement {
  const row: RailSettlement = {
    ref: `bypass-${input.req.nonce}`,
    amount: input.req.amount.toString(),
    currency: input.req.currency,
    timestampMs: nowMs,
  };
  ledger.record(row);
  return row;
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

  // Padding a short nonce up to the minimum made two different requests share
  // one receipt nonce while the policy engine still saw them as distinct. A
  // nonce is the caller's promise that this request is not another one; a value
  // too short to carry that promise is refused rather than repaired.
  if (!isValidNonce(input.req.nonce)) {
    return deny402(input.req, "nonce-too-short");
  }

  if (input.manifest) {
    if (!verifyManifest(input.manifest, input.manifestTrust)) {
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
    const consumed = decision.token
      ? engine.consumeDecisionToken(decision.token, input.req, nowMs)
      : engine.consumeDecision(decision.decisionId, decision.requestHash, input.req);
    if (!consumed.allow) {
      return deny402(input.req, consumed.reason);
    }
  }
  return issue(input, keys, nowMs, `x402-${input.req.nonce}`, prevReceiptHash, engine, undefined);
}

export function gatedSettleWithLedger(
  engine: PolicyEngine | null,
  input: PayInput,
  keys: AdapterKeys,
  nowMs: number,
  ledger: RailLedger,
  prevReceiptHash: string | null = null,
): PayResult {
  const result = gatedSettle(engine, input, keys, nowMs, prevReceiptHash);
  if (result.status === 200) {
    const ref = result.receipt.claims.x402PaymentRef ?? `x402-${input.req.nonce}`;
    ledger.record({
      ref,
      amount: result.receipt.claims.amount,
      currency: result.receipt.claims.currency,
      timestampMs: result.receipt.claims.timestampMs,
    });
  }
  return result;
}

function issue(
  input: PayInput,
  keys: AdapterKeys,
  nowMs: number,
  x402Ref: string,
  prevReceiptHash: string | null = null,
  engine: PolicyEngine | null = null,
  ledger?: RailLedger,
): PayResult {
  // Every path that mints a receipt refuses the same input the same way. The
  // gated path checks earlier so a rejected request never reaches the policy
  // counters; without this second check the unguarded path would throw out of
  // signReceipt where its sibling returns a payment error.
  if (!isValidNonce(input.req.nonce)) {
    return deny402(input.req, "nonce-too-short");
  }
  const policyHash = engine
    ? sha256Hex(canonical(policyDocument(engine.policy)))
    : sha256Hex("no-policy");
  if (ledger) {
    ledger.record({
      ref: x402Ref,
      amount: input.req.amount.toString(),
      currency: input.req.currency,
      timestampMs: nowMs,
    });
  }
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
      outcome: "settled",
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
