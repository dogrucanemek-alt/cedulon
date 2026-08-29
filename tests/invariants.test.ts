import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CedulonSession } from "../packages/mcp-server/src/session.ts";

const SEED = 20260829;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function statePath(): string {
  return join(mkdtempSync(join(tmpdir(), "cedulon-inv-")), "state.json");
}

function nonce(i: number): string {
  return `n${i}`.padEnd(16, "-");
}

type Snapshot = {
  receipts: number;
  ledger: number;
  allowed: number;
  nonces: string[];
  diskNonces: string[];
};

function snap(session: CedulonSession, path: string): Snapshot {
  let diskNonces: string[] = [];
  try {
    const saved = JSON.parse(readFileSync(path, "utf8")) as {
      receipts: Array<{ claims: { nonce: string } }>;
    };
    diskNonces = saved.receipts.map((r) => r.claims.nonce);
  } catch {
    diskNonces = [];
  }
  return {
    receipts: session.receipts.length,
    ledger: session.ledger.extract().length,
    allowed: session.engine.store.counters.allowedCount,
    nonces: [...session.engine.store.usedNonces],
    diskNonces,
  };
}

function assertInvariants(session: CedulonSession, path: string, accepted: string[], rejected: string[]): void {
  const s = snap(session, path);
  assert.equal(s.receipts, s.ledger, "every accepted spend has exactly one receipt and one ledger row");
  assert.equal(s.receipts, accepted.length, "receipt count matches accepted spends");
  assert.deepEqual(
    session.receipts.map((r) => r.claims.nonce).sort(),
    [...accepted].sort(),
  );
  assert.deepEqual(s.diskNonces.sort(), [...accepted].sort(), "disk holds only accepted spends");
  for (const n of rejected) {
    assert.equal(s.nonces.includes(n), false, `rejected nonce ${n} left a policy trace`);
    assert.equal(s.diskNonces.includes(n), false, `rejected nonce ${n} reached disk`);
    assert.equal(
      session.ledger.extract().some((row) => row.ref.includes(n) || row.ref === n),
      false,
    );
  }
  const unique = new Set(accepted);
  assert.equal(unique.size, accepted.length, "the same nonce settled twice");
}

describe("spend sequence invariants", () => {
  it("RED: a rejected spend that leaves a ledger row fails the no-trace invariant", () => {
    const path = statePath();
    const session = new CedulonSession({
      statePath: path,
      policy: {
        maxAmount: 10n,
        maxCumulative: 100n,
        maxPayments: 2,
        windowMs: 3_600_000,
        allowedPayees: ["payee-1"],
        allowedCurrencies: ["USD"],
        allowedTools: undefined,
      },
    });
    assert.equal(session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: nonce(0) }, 1).ok, true);
    const denied = session.spend({ amount: "1", currency: "USD", payee: "nope", nonce: nonce(1) }, 2);
    assert.equal(denied.ok, false);
    session.ledger.record({
      ref: nonce(1),
      amount: "1",
      currency: "USD",
      timestampMs: 2,
    });
    assert.throws(
      () => assertInvariants(session, path, [nonce(0)], [nonce(1)]),
      /receipt count|ledger/,
    );
  });

  it("RED: the same nonce appearing twice in the accepted set fails uniqueness", () => {
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    assert.equal(session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: nonce(0) }, 1).ok, true);
    assert.throws(() => assertInvariants(session, path, [nonce(0), nonce(0)], []), /accepted spends|settled twice/);
  });

  it("quota does not depend on the order of a refused and an accepted spend", () => {
    const policy = {
      maxAmount: 10n,
      maxCumulative: 10n,
      maxPayments: 1,
      windowMs: 3_600_000,
      allowedPayees: ["payee-1"],
      allowedCurrencies: ["USD"],
      allowedTools: undefined,
    };
    const run = (first: "deny" | "allow") => {
      const session = new CedulonSession({ statePath: statePath(), policy });
      const deny = { amount: "1", currency: "USD", payee: "nope", nonce: nonce(1) };
      const allow = { amount: "1", currency: "USD", payee: "payee-1", nonce: nonce(2) };
      if (first === "deny") {
        assert.equal(session.spend(deny, 1).ok, false);
        assert.equal(session.spend(allow, 2).ok, true);
      } else {
        assert.equal(session.spend(allow, 1).ok, true);
        assert.equal(session.spend(deny, 2).ok, false);
      }
      return session.engine.store.counters.allowedCount;
    };
    assert.equal(run("deny"), 1);
    assert.equal(run("allow"), 1);
  });

  it("random spend sequences keep the invariants, including after reload", () => {
    const rand = mulberry32(SEED);
    for (let trial = 0; trial < 24; trial += 1) {
      const path = statePath();
      const session = new CedulonSession({
        statePath: path,
        policy: {
          maxAmount: 5n,
          maxCumulative: 12n,
          maxPayments: 4,
          windowMs: 3_600_000,
          allowedPayees: ["payee-1"],
          allowedCurrencies: ["USD"],
          allowedTools: undefined,
        },
      });
      const accepted: string[] = [];
      const rejected: string[] = [];
      let t = 1;
      for (let i = 0; i < 12; i += 1) {
        const roll = rand();
        const n = nonce(trial * 100 + i);
        const args =
          roll < 0.15
            ? { amount: "1", currency: "USD", payee: "nope", nonce: n }
            : roll < 0.25
              ? { amount: "9", currency: "USD", payee: "payee-1", nonce: n }
              : roll < 0.35 && accepted.length > 0
                ? { amount: "1", currency: "USD", payee: "payee-1", nonce: accepted[0]! }
                : { amount: "1", currency: "USD", payee: "payee-1", nonce: n };
        const out = session.spend(args, t);
        t += 1;
        if (out.ok) accepted.push(args.nonce);
        else if (!accepted.includes(args.nonce)) rejected.push(args.nonce);
      }
      assertInvariants(session, path, accepted, rejected);

      const restarted = new CedulonSession({
        statePath: path,
        policy: session.engine.policy,
        keys: session.keys,
      });
      assert.deepEqual(
        restarted.receipts.map((r) => r.claims.nonce).sort(),
        [...accepted].sort(),
        "reload does not resurrect a refused spend or drop an accepted one",
      );
      assert.equal(restarted.ledger.extract().length, accepted.length);
    }
  });
});
