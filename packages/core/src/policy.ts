import { canonical } from "./canonical.ts";
import type { Decision, Policy, SpendRequest } from "./types.ts";
import { MemoryStore } from "./store.ts";

export function requestHashOf(req: SpendRequest): string {
  return canonical({
    amount: req.amount.toString(),
    currency: req.currency,
    payee: req.payee,
    nonce: req.nonce,
    manifestHash: req.manifestHash ?? null,
    tool: req.tool ?? null,
  });
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

  constructor(policy: Policy, store: MemoryStore = new MemoryStore()) {
    this.policy = policy;
    this.store = store;
  }

  evaluate(req: SpendRequest): Decision {
    if (this.store.usedNonces.has(req.nonce)) {
      return { allow: false, reason: "replay-nonce" };
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
    if (this.policy.allowedTools && req.tool && !this.policy.allowedTools.includes(req.tool)) {
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
    return {
      allow: true,
      decisionId,
      requestHash: requestHashOf(req),
      reason: "allow",
    };
  }

  consumeDecision(decisionId: string, requestHash: string, req: SpendRequest): Decision {
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
