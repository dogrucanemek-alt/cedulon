import { createHash } from "node:crypto";

import { canonical } from "./canonical.ts";
import { issueDecisionToken, verifyDecisionToken, type SignedDecisionToken } from "./decision-token.ts";
import type { Decision, Policy, SpendRequest } from "./types.ts";
import { MemoryStore } from "./store.ts";

export type DecisionIssuerKeys = {
  privateKeyPem: string;
  publicKeyPem: string;
  ttlMs?: number;
};

export function requestHashOf(req: SpendRequest): string {
  return createHash("sha256")
    .update(
      canonical({
        amount: req.amount.toString(),
        currency: req.currency,
        payee: req.payee,
        nonce: req.nonce,
        manifestHash: req.manifestHash ?? null,
        tool: req.tool ?? null,
      }),
    )
    .digest("hex");
}

export function policyDocument(policy: Policy): Record<string, unknown> {
  return {
    maxAmount: policy.maxAmount.toString(),
    maxCumulative: policy.maxCumulative.toString(),
    maxPayments: policy.maxPayments,
    windowMs: policy.windowMs,
    allowedPayees: policy.allowedPayees ? [...policy.allowedPayees] : null,
    allowedCurrencies: policy.allowedCurrencies
      ? [...policy.allowedCurrencies]
      : null,
    allowedTools: policy.allowedTools ? [...policy.allowedTools] : null,
  };
}

export class PolicyEngine {
  private nextDecision = 1;
  readonly policy: Policy;
  readonly store: MemoryStore;
  readonly issuerKeys: DecisionIssuerKeys | null;

  constructor(
    policy: Policy,
    store: MemoryStore = new MemoryStore(),
    issuerKeys: DecisionIssuerKeys | null = null,
  ) {
    this.policy = policy;
    this.store = store;
    this.issuerKeys = issuerKeys;
  }

  evaluate(req: SpendRequest): Decision {
    if (this.store.usedNonces.has(req.nonce)) {
      return { allow: false, reason: "replay-nonce" };
    }
    // A limit with only an upper bound is half a limit: a negative amount clears
    // it, then subtracts from the cumulative counter and reopens a budget that
    // was already spent. Zero passes no money and still burns a nonce and a slot.
    if (req.amount <= 0n) {
      return { allow: false, reason: "amount-not-positive" };
    }
    if (req.amount > this.policy.maxAmount) {
      return { allow: false, reason: "limit-amount" };
    }
    if (this.policy.allowedPayees && !this.policy.allowedPayees.includes(req.payee)) {
      return { allow: false, reason: "scope-payee" };
    }
    if (
      this.policy.allowedCurrencies &&
      !this.policy.allowedCurrencies.includes(req.currency)
    ) {
      return { allow: false, reason: "scope-currency" };
    }
    // An allow-list a caller can opt out of by omitting the field is not an
    // allow-list. Once a list is configured, a request that names no tool is
    // outside it.
    if (this.policy.allowedTools && (req.tool === undefined || !this.policy.allowedTools.includes(req.tool))) {
      return { allow: false, reason: "scope-tool" };
    }

    this.rollWindow(req.nowMs);
    if (this.store.counters.allowedCount >= this.policy.maxPayments) {
      return { allow: false, reason: "velocity" };
    }
    if (this.store.counters.allowedSum + req.amount > this.policy.maxCumulative) {
      return { allow: false, reason: "limit-cumulative" };
    }

    this.store.usedNonces.add(req.nonce);
    this.store.counters.allowedCount += 1;
    this.store.counters.allowedSum += req.amount;
    const decisionId = `dec-${this.nextDecision}`;
    this.nextDecision += 1;
    const requestHash = requestHashOf(req);
    const token = this.issuerKeys
      ? issueDecisionToken(
          req,
          this.policy,
          decisionId,
          req.nowMs + (this.issuerKeys.ttlMs ?? 60_000),
          this.issuerKeys.privateKeyPem,
          this.issuerKeys.publicKeyPem,
        )
      : undefined;
    return {
      allow: true,
      decisionId,
      requestHash,
      reason: "allow",
      token,
    };
  }

  consumeDecisionToken(token: SignedDecisionToken, req: SpendRequest, nowMs: number): Decision {
    // This engine holds the key it signs decisions with, so there is no reason to
    // ask the token which key to check it against. A token minted by anyone else
    // is not this engine's decision, whatever it says inside.
    if (!this.issuerKeys) {
      return { allow: false, reason: "decision-bad-sig" };
    }
    if (!verifyDecisionToken(token, nowMs, this.issuerKeys.publicKeyPem)) {
      if (token.claims.expiryMs < nowMs) {
        return { allow: false, reason: "decision-expired" };
      }
      return { allow: false, reason: "decision-bad-sig" };
    }
    return this.consumeDecision(token.claims.singleUseId, token.claims.requestHash, req);
  }

  consumeDecision(decisionId: string, requestHash: string, req: SpendRequest): Decision {
    // evaluate() refuses these, but it is not the only door into a decision: a
    // caller holding a token reaches this one directly.
    if (req.amount <= 0n) {
      return { allow: false, reason: "amount-not-positive" };
    }
    if (this.store.consumedDecisions.has(decisionId)) {
      return { allow: false, reason: "decision-replay" };
    }
    if (requestHashOf(req) !== requestHash) {
      return { allow: false, reason: "decision-mismatch" };
    }
    this.store.consumedDecisions.add(decisionId);
    return {
      allow: true,
      decisionId,
      requestHash,
      reason: "allow",
    };
  }

  private rollWindow(nowMs: number): void {
    const c = this.store.counters;
    if (c.windowStartMs === 0 || nowMs - c.windowStartMs >= this.policy.windowMs) {
      this.store.counters = {
        windowStartMs: nowMs,
        allowedCount: 0,
        allowedSum: 0n,
      };
    }
  }
}
