import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyEngine, requestHashOf } from "@agent-trade-protocol/core";

function engine(extra: Partial<ConstructorParameters<typeof PolicyEngine>[0]> = {}) {
  return new PolicyEngine({
    maxAmount: 10n,
    maxCumulative: 20n,
    maxPayments: 3,
    windowMs: 1000,
    allowedPayees: ["ok"],
    allowedCurrencies: ["USD"],
    allowedTools: ["spend"],
    ...extra,
  });
}

describe("policy limits velocity scope", () => {
  it("denies over per-payment limit", () => {
    const e = engine();
    const d = e.evaluate({
      amount: 11n,
      currency: "USD",
      payee: "ok",
      nonce: "a",
      nowMs: 1,
      tool: "spend",
    });
    assert.equal(d.allow, false);
    assert.equal(d.reason, "limit-amount");
  });

  it("denies over cumulative limit", () => {
    const e = engine({ maxPayments: 5, maxAmount: 10n, maxCumulative: 5n });
    e.evaluate({
      amount: 4n,
      currency: "USD",
      payee: "ok",
      nonce: "a",
      nowMs: 1,
      tool: "spend",
    });
    const d = e.evaluate({
      amount: 2n,
      currency: "USD",
      payee: "ok",
      nonce: "b",
      nowMs: 1,
      tool: "spend",
    });
    assert.equal(d.reason, "limit-cumulative");
  });

  it("denies over velocity", () => {
    const e = engine({ maxPayments: 1, maxCumulative: 100n });
    e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "a",
      nowMs: 1,
      tool: "spend",
    });
    const d = e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "b",
      nowMs: 1,
      tool: "spend",
    });
    assert.equal(d.reason, "velocity");
  });

  it("denies payee outside scope", () => {
    const e = engine();
    assert.equal(
      e.evaluate({
        amount: 1n,
        currency: "USD",
        payee: "evil",
        nonce: "a",
        nowMs: 1,
        tool: "spend",
      }).reason,
      "scope-payee",
    );
  });

  it("denies currency outside scope", () => {
    const e = engine();
    assert.equal(
      e.evaluate({
        amount: 1n,
        currency: "EUR",
        payee: "ok",
        nonce: "a",
        nowMs: 1,
        tool: "spend",
      }).reason,
      "scope-currency",
    );
  });

  it("denies tool outside scope", () => {
    const e = engine();
    assert.equal(
      e.evaluate({
        amount: 1n,
        currency: "USD",
        payee: "ok",
        nonce: "a",
        nowMs: 1,
        tool: "other",
      }).reason,
      "scope-tool",
    );
  });

  it("denied attempt does not consume velocity", () => {
    const e = engine({ maxPayments: 1, maxCumulative: 100n });
    e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "evil",
      nonce: "bad",
      nowMs: 1,
      tool: "spend",
    });
    assert.equal(
      e.evaluate({
        amount: 1n,
        currency: "USD",
        payee: "ok",
        nonce: "good",
        nowMs: 1,
        tool: "spend",
      }).allow,
      true,
    );
  });

  it("rolls window and allows again", () => {
    const e = engine({ maxPayments: 1, maxCumulative: 100n, windowMs: 10 });
    e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "a",
      nowMs: 1,
      tool: "spend",
    });
    assert.equal(
      e.evaluate({
        amount: 1n,
        currency: "USD",
        payee: "ok",
        nonce: "b",
        nowMs: 12,
        tool: "spend",
      }).allow,
      true,
    );
  });

  it("request hash is stable", () => {
    const req = {
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "n",
      nowMs: 1,
      tool: "spend",
    };
    assert.equal(requestHashOf(req), requestHashOf({ ...req, nowMs: 99 }));
  });

  it("consumeDecision rejects swapped fields", () => {
    const e = engine();
    const req = {
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "n",
      nowMs: 1,
      tool: "spend",
    };
    const d = e.evaluate(req);
    if (!d.allow) {
      throw new Error("expected allow");
    }
    const swapped = { ...req, amount: 2n };
    assert.equal(e.consumeDecision(d.decisionId, d.requestHash, swapped).reason, "decision-mismatch");
  });

  it("consumeDecision is single-use", () => {
    const e = engine();
    const req = {
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "n",
      nowMs: 1,
      tool: "spend",
    };
    const d = e.evaluate(req);
    if (!d.allow) {
      throw new Error("expected allow");
    }
    assert.equal(e.consumeDecision(d.decisionId, d.requestHash, req).allow, true);
    assert.equal(e.consumeDecision(d.decisionId, d.requestHash, req).reason, "decision-replay");
  });
});
