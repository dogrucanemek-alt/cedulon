import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import {
  PolicyEngine,
  issueDecisionToken,
  requestHashOf,
  verifyDecisionToken,
} from "@cedulon/core";

function fixtureKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

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
  it("37 RED then GREEN: a negative amount cannot reopen an exhausted budget", () => {
    // The per-payment check had an upper bound and no lower one, so a negative
    // amount passed it, subtracted from the cumulative counter, and handed the
    // spender back a budget they had already used.
    const e = engine({ maxAmount: 100n, maxCumulative: 100n, maxPayments: 10 });
    const base = { currency: "USD", payee: "ok", nowMs: 1, tool: "spend" };
    assert.equal(e.evaluate({ ...base, amount: 100n, nonce: "a".padEnd(16, "-") }).allow, true);
    assert.equal(e.evaluate({ ...base, amount: 1n, nonce: "b".padEnd(16, "-") }).reason, "limit-cumulative");

    const negative = e.evaluate({ ...base, amount: -1000n, nonce: "c".padEnd(16, "-") });
    assert.equal(negative.allow, false);
    assert.equal(negative.reason, "amount-not-positive");
    assert.equal(e.evaluate({ ...base, amount: 100n, nonce: "d".padEnd(16, "-") }).reason, "limit-cumulative");
    assert.equal(e.store.counters.allowedSum, 100n, "the counter never moved backwards");
    assert.equal(
      e.store.usedNonces.has("c".padEnd(16, "-")),
      false,
      "a rejected request spends no nonce",
    );

    // Zero is refused for the same reason: it consumes a nonce and a slot while
    // moving no money, which is a way to burn the payment count for free.
    assert.equal(e.evaluate({ ...base, amount: 0n, nonce: "e".padEnd(16, "-") }).reason, "amount-not-positive");
  });

  it("38 RED then GREEN: a request with no tool cannot slip past an allowedTools list", () => {
    // The check read `allowedTools && req.tool && ...`, so omitting the field
    // skipped the list entirely. An allow-list that any caller can opt out of is
    // not an allow-list.
    const e = engine({ allowedTools: ["search"] });
    const withoutTool = e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "a".padEnd(16, "-"),
      nowMs: 1,
    });
    assert.equal(withoutTool.allow, false);
    assert.equal(withoutTool.reason, "scope-tool");

    // With no list configured the field stays optional, as before.
    const open = engine({ allowedTools: undefined });
    assert.equal(
      open.evaluate({ amount: 1n, currency: "USD", payee: "ok", nonce: "b".padEnd(16, "-"), nowMs: 1 }).allow,
      true,
    );
  });

  it("denies over per-payment limit", () => {
    const e = engine();
    const d = e.evaluate({
      amount: 11n,
      currency: "USD",
      payee: "ok",
      nonce: "a".padEnd(16, "-"),
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
      nonce: "a".padEnd(16, "-"),
      nowMs: 1,
      tool: "spend",
    });
    const d = e.evaluate({
      amount: 2n,
      currency: "USD",
      payee: "ok",
      nonce: "b".padEnd(16, "-"),
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
      nonce: "a".padEnd(16, "-"),
      nowMs: 1,
      tool: "spend",
    });
    const d = e.evaluate({
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "b".padEnd(16, "-"),
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
        nonce: "a".padEnd(16, "-"),
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
        nonce: "a".padEnd(16, "-"),
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
        nonce: "a".padEnd(16, "-"),
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
      nonce: "bad".padEnd(16, "-"),
      nowMs: 1,
      tool: "spend",
    });
    assert.equal(
      e.evaluate({
        amount: 1n,
        currency: "USD",
        payee: "ok",
        nonce: "good".padEnd(16, "-"),
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
      nonce: "a".padEnd(16, "-"),
      nowMs: 1,
      tool: "spend",
    });
    assert.equal(
      e.evaluate({
        amount: 1n,
        currency: "USD",
        payee: "ok",
        nonce: "b".padEnd(16, "-"),
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
      nonce: "n".padEnd(16, "-"),
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
      nonce: "n".padEnd(16, "-"),
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
      nonce: "n".padEnd(16, "-"),
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

  it("RED then GREEN: Decision Token COSE tamper fails verify", () => {
    const k = fixtureKeys();
    const e = engine();
    const req = {
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "n".padEnd(16, "-"),
      nowMs: 1,
      tool: "spend",
    };
    const d = e.evaluate(req);
    if (!d.allow) {
      throw new Error("expected allow");
    }
    const token = issueDecisionToken(req, e.policy, d.decisionId, 10_000, k.privateKeyPem, k.publicKeyPem);
    assert.equal(verifyDecisionToken(token, 1), true);
    const raw = Buffer.from(token.coseHex, "hex");
    raw[raw.length - 1] ^= 0x01;
    const tampered = { ...token, coseHex: raw.toString("hex") };
    assert.equal(verifyDecisionToken(tampered, 1), false);
    assert.equal(verifyDecisionToken(token, 1), true);
  });

  it("engine-issued Decision Token is consumed once and rejects tamper", () => {
    const k = fixtureKeys();
    const e = new PolicyEngine(
      {
        maxAmount: 10n,
        maxCumulative: 20n,
        maxPayments: 3,
        windowMs: 1000,
        allowedPayees: ["ok"],
        allowedCurrencies: ["USD"],
        allowedTools: ["spend"],
      },
      undefined,
      { ...k, ttlMs: 10_000 },
    );
    const req = {
      amount: 1n,
      currency: "USD",
      payee: "ok",
      nonce: "n".padEnd(16, "-"),
      nowMs: 1,
      tool: "spend",
    };
    const d = e.evaluate(req);
    if (!d.allow || !d.token) {
      throw new Error("expected signed token");
    }
    const raw = Buffer.from(d.token.coseHex, "hex");
    raw[raw.length - 1] ^= 0x01;
    const tampered = { ...d.token, coseHex: raw.toString("hex") };
    assert.equal(e.consumeDecisionToken(tampered, req, 1).reason, "decision-bad-sig");
    assert.equal(e.consumeDecisionToken(d.token, req, 1).allow, true);
    assert.equal(e.consumeDecisionToken(d.token, req, 1).reason, "decision-replay");
  });
});
