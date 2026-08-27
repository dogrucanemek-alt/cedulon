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
