import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  failClosedEvaluate,
  naivePayAlwaysAllow,
  PolicyEngine,
  type SpendRequest,
} from "@cedulon/core";

const req: SpendRequest = {
  amount: 1n,
  currency: "USD",
  payee: "p",
  nonce: "n".padEnd(16, "-"),
  nowMs: 10,
};

describe("fail-closed", () => {
  it("unguarded hole: null engine still allows (red path)", () => {
    assert.equal(naivePayAlwaysAllow(null, req).allow, true);
  });

  it("guarded: null engine denies", () => {
    assert.deepEqual(failClosedEvaluate(null, req), {
      allow: false,
      reason: "engine-unavailable",
    });
  });

  it("guarded: undefined engine denies", () => {
    assert.equal(failClosedEvaluate(undefined, req).allow, false);
  });

  it("guarded: throwing engine denies", () => {
    const engine = {
      evaluate() {
        throw new Error("boom");
      },
    } as unknown as PolicyEngine;
    assert.deepEqual(failClosedEvaluate(engine, req), {
      allow: false,
      reason: "engine-fault",
    });
  });

  it("healthy engine can allow", () => {
    const engine = new PolicyEngine({
      maxAmount: 10n,
      maxCumulative: 10n,
      maxPayments: 1,
      windowMs: 1000,
    });
    assert.equal(failClosedEvaluate(engine, req).allow, true);
  });
});
