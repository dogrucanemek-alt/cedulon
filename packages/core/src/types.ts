import type { SignedDecisionToken } from "./decision-token.ts";

export type Policy = {
  maxAmount: bigint;
  maxCumulative: bigint;
  maxPayments: number;
  windowMs: number;
  allowedPayees?: readonly string[];
  allowedCurrencies?: readonly string[];
  allowedTools?: readonly string[];
};

export type SpendRequest = {
  amount: bigint;
  currency: string;
  payee: string;
  nonce: string;
  nowMs: number;
  tool?: string;
  manifestHash?: string;
};

export type AllowDecision = {
  allow: true;
  decisionId: string;
  requestHash: string;
  reason: "allow";
  token?: SignedDecisionToken;
};

export type DenyDecision = {
  allow: false;
  reason:
    | "engine-unavailable"
    | "engine-fault"
    | "default-deny"
    | "amount-not-positive"
    | "limit-amount"
    | "limit-cumulative"
    | "velocity"
    | "scope-payee"
    | "scope-currency"
    | "scope-tool"
    | "replay-nonce"
    | "expired-manifest"
    | "manifest-mismatch"
    | "decision-mismatch"
    | "decision-replay"
    | "decision-expired"
    | "decision-bad-sig";
};

export type Decision = AllowDecision | DenyDecision;

/**
 * The amount grammar. One number has one spelling: no leading zero, no sign,
 * no whitespace, no base prefix. A boundary that parses an amount with
 * BigInt() before checking this admits "01", " 1" and "0x10" and erases the
 * octets MUST-T8-2 compares, so the check has to run on the text.
 */
export const AMOUNT_RE = /^(0|[1-9][0-9]*)$/;

export function isValidAmountText(amount: unknown): amount is string {
  return typeof amount === "string" && AMOUNT_RE.test(amount);
}

/**
 * Table 3/5/7 hash-shaped claims: 64-character lowercase hex SHA-256.
 * The decoder keeps reading a tstr; this grammar is the validator.
 */
export const HASH_HEX_RE = /^[0-9a-f]{64}$/;

/** Hash-shaped claims named by Table 3, Table 5, Table 7, and the decision labels. */
export const HASH_CLAIM_FIELDS = [
  "policyHash",
  "requestHash",
  "acceptanceCriteriaHash",
  "manifestHash",
  "receiptHash",
  "prevReceiptHash",
  "chainHeadHash",
  "prevCheckpointHash",
  "ap2MandateHash",
] as const;

export type HashClaimField = (typeof HASH_CLAIM_FIELDS)[number];

export function isValidHashText(value: unknown): value is string {
  return typeof value === "string" && HASH_HEX_RE.test(value);
}

export function malformedHashCode(field: HashClaimField): `malformed-${string}` {
  const kebab = field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return `malformed-${kebab}`;
}

/** Null when the value is in grammar (or null on a nullable field). */
export function hashClaimRefusal(field: HashClaimField, value: unknown, nullable = false): string | null {
  if (value === null && nullable) return null;
  return isValidHashText(value) ? null : malformedHashCode(field);
}
