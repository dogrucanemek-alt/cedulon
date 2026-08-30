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
