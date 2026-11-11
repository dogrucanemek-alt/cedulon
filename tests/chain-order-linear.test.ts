import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, findCheckpointTotalMismatches, orderByIssuerChain } from "@cedulon/audit";
import { buildCheckpointClaims, checkpointHash, signCheckpoint, type SignedCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash, type SignedReceipt, signReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW = 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

/**
 * Reference body: copy of the pre-fix orderByIssuerChain implementation.
 * Used only to prove the live export stays behaviour-identical.
 */
function orderByIssuerChainReference(
  receipts: SignedReceipt[],
  expectedRootPrev: string | null = null,
): {
  ordered: SignedReceipt[];
  leftover: SignedReceipt[];
} {
  if (receipts.length === 0) {
    return { ordered: [], leftover: [] };
  }
  const remaining = new Set<number>(receipts.map((_, i) => i));
  const starts = receipts
    .map((r, i) => i)
    .filter((i) => receipts[i].claims.prevReceiptHash === expectedRootPrev);
  const ordered: SignedReceipt[] = [];
  let current: number | null = starts.length === 1 ? starts[0] : null;
  while (current !== null && remaining.has(current)) {
    remaining.delete(current);
    ordered.push(receipts[current]);
    let nextHash: string | null = null;
    try {
      nextHash = receiptHash(receipts[current]);
    } catch {
      break;
    }
    const nexts = [...remaining].filter((i) => receipts[i].claims.prevReceiptHash === nextHash);
    if (nexts.length !== 1) {
      break;
    }
    current = nexts[0];
  }
  return { ordered, leftover: [...remaining].map((i) => receipts[i]) };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function signOne(keys: Keys, prev: string | null, nonce: string, timestampMs: number): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee-1",
      amount: "1",
      currency: "USD",
      policyHash: TEST_HASH,
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: `ref-${nonce}`,
      timestampMs,
      nonce: nonce.padEnd(16, "-"),
      prevReceiptHash: prev,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function straightChain(keys: Keys, n: number, rootPrev: string | null = null): SignedReceipt[] {
  const out: SignedReceipt[] = [];
  let prev = rootPrev;
  for (let i = 0; i < n; i += 1) {
    const signed = signOne(keys, prev, `n${i}`, NOW + i);
    out.push(signed);
    prev = receiptHash(signed);
  }
  return out;
}

function assertSamePlacement(
  a: { ordered: SignedReceipt[]; leftover: SignedReceipt[] },
  b: { ordered: SignedReceipt[]; leftover: SignedReceipt[] },
): void {
  assert.equal(a.ordered.length, b.ordered.length);
  assert.equal(a.leftover.length, b.leftover.length);
  for (let i = 0; i < a.ordered.length; i += 1) {
    assert.equal(a.ordered[i], b.ordered[i]);
  }
  for (let i = 0; i < a.leftover.length; i += 1) {
    assert.equal(a.leftover[i], b.leftover[i]);
  }
}

function withPrevReceiptHashReads(receipts: SignedReceipt[], run: (wrapped: SignedReceipt[]) => void): number {
  let reads = 0;
  const wrapped = receipts.map((receipt) => {
    const claims = new Proxy(receipt.claims, {
      get(target, prop, receiver) {
        if (prop === "prevReceiptHash") {
          reads += 1;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    return new Proxy(receipt, {
      get(target, prop, receiver) {
        if (prop === "claims") {
          return claims;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  });
  run(wrapped);
  return reads;
}

function throwOnHash(receipt: SignedReceipt): SignedReceipt {
  return {
    ...receipt,
    encoding: "json",
    coseHex: undefined,
    claims: {
      ...receipt.claims,
      payer: `x\uD800y`,
    },
  };
}

function withPrev(receipt: SignedReceipt, prev: unknown): SignedReceipt {
  return {
    ...receipt,
    claims: {
      ...receipt.claims,
      prevReceiptHash: prev as SignedReceipt["claims"]["prevReceiptHash"],
    },
  };
}

function assertThrowsClaimsRead(run: () => unknown): void {
  assert.throws(run, (err: unknown) => {
    assert.ok(err instanceof TypeError);
    assert.match(String(err.message), /claims/);
    return true;
  });
}

describe("orderByIssuerChain linear equivalence", () => {
  it("matches the reference body on fixed-seed small bags", () => {
    const keys = generateReceiptKeys();
    const rand = mulberry32(0xced01);
    const cases: Array<{ receipts: SignedReceipt[]; expectedRootPrev: string | null }> = [];

    cases.push({ receipts: [], expectedRootPrev: null });
    cases.push({ receipts: [], expectedRootPrev: TEST_HASH });

    for (let n = 1; n <= 12; n += 1) {
      const chain = straightChain(keys, n);
      cases.push({ receipts: chain, expectedRootPrev: null });
      const shuffled = [...chain];
      shuffleInPlace(shuffled, rand);
      cases.push({ receipts: shuffled, expectedRootPrev: null });
      cases.push({ receipts: chain, expectedRootPrev: TEST_HASH });
      if (n >= 2) {
        cases.push({ receipts: shuffled, expectedRootPrev: receiptHash(chain[0]!) });
      }
    }

    {
      const a = signOne(keys, null, "a0", NOW);
      const b = signOne(keys, null, "b0", NOW + 1);
      cases.push({ receipts: [a, b], expectedRootPrev: null });
      cases.push({ receipts: [b, a], expectedRootPrev: null });
    }

    {
      const root = signOne(keys, null, "fork0", NOW);
      const h = receiptHash(root);
      const left = signOne(keys, h, "forkL", NOW + 1);
      const right = signOne(keys, h, "forkR", NOW + 2);
      cases.push({ receipts: [root, left, right], expectedRootPrev: null });
      cases.push({ receipts: [right, root, left], expectedRootPrev: null });
    }

    {
      const a = signOne(keys, null, "gap0", NOW);
      const b = signOne(keys, TEST_HASH, "gap1", NOW + 1);
      cases.push({ receipts: [a, b], expectedRootPrev: null });
      cases.push({ receipts: [b, a], expectedRootPrev: null });
    }

    {
      const chain = straightChain(keys, 4);
      cases.push({ receipts: [chain[1]!, chain[1]!, chain[0]!, chain[2]!], expectedRootPrev: null });
      cases.push({ receipts: [chain[0]!, chain[0]!], expectedRootPrev: null });
    }

    {
      const chain = straightChain(keys, 3);
      const broken = [chain[0]!, throwOnHash(chain[1]!), chain[2]!];
      cases.push({ receipts: broken, expectedRootPrev: null });
      const shuffled = [...broken];
      shuffleInPlace(shuffled, rand);
      cases.push({ receipts: shuffled, expectedRootPrev: null });
    }

    {
      const self = signOne(keys, null, "self0", NOW);
      cases.push({
        receipts: [withPrev(self, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
        expectedRootPrev: null,
      });
      cases.push({
        receipts: [withPrev(self, receiptHash(self))],
        expectedRootPrev: null,
      });
      const a = signOne(keys, null, "cycA", NOW);
      const b = signOne(keys, null, "cycB", NOW + 1);
      const hand = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      cases.push({
        receipts: [withPrev(a, hand), withPrev(b, hand)],
        expectedRootPrev: hand,
      });
      cases.push({
        receipts: [withPrev(a, receiptHash(b)), withPrev(b, receiptHash(a))],
        expectedRootPrev: null,
      });
    }

    {
      const base = signOne(keys, null, "prevX", NOW);
      const mid = signOne(keys, TEST_HASH, "prevY", NOW + 1);
      cases.push({ receipts: [withPrev(base, undefined)], expectedRootPrev: null });
      cases.push({
        receipts: [base, withPrev(mid, null), signOne(keys, receiptHash(mid), "prevZ", NOW + 2)],
        expectedRootPrev: null,
      });
      cases.push({ receipts: [withPrev(base, 7)], expectedRootPrev: null });
      cases.push({ receipts: [withPrev(base, { k: 1 })], expectedRootPrev: null });
      cases.push({ receipts: [withPrev(base, "__proto__")], expectedRootPrev: null });
      cases.push({
        receipts: [withPrev(base, "__proto__")],
        expectedRootPrev: "__proto__" as unknown as string | null,
      });
    }

    const targetCaseCount = 200;
    while (cases.length < targetCaseCount) {
      const n = 1 + Math.floor(rand() * 10);
      const chain = straightChain(keys, n);
      const bag = [...chain];
      shuffleInPlace(bag, rand);
      const rootChoice = rand();
      const expectedRootPrev =
        rootChoice < 0.5 ? null : rootChoice < 0.75 ? TEST_HASH : receiptHash(chain[0]!);
      cases.push({ receipts: bag, expectedRootPrev });
    }

    assert.equal(cases.length, targetCaseCount);
    for (const c of cases) {
      assertSamePlacement(
        orderByIssuerChain(c.receipts, c.expectedRootPrev),
        orderByIssuerChainReference(c.receipts, c.expectedRootPrev),
      );
    }
  });

  it("start matching uses === so NaN roots do not join", () => {
    const keys = generateReceiptKeys();
    const base = signOne(keys, null, "nan0", NOW);
    const nanRoot = withPrev(base, Number.NaN);
    const expectedRootPrev = Number.NaN as unknown as string | null;
    assertSamePlacement(
      orderByIssuerChain([nanRoot], expectedRootPrev),
      orderByIssuerChainReference([nanRoot], expectedRootPrev),
    );
    assert.deepEqual(orderByIssuerChain([nanRoot], expectedRootPrev), {
      ordered: [],
      leftover: [nanRoot],
    });
  });

  it("start matching covers undefined, null, 0, and -0 roots", () => {
    const keys = generateReceiptKeys();
    const base = signOne(keys, null, "root0", NOW);
    // A missing or undefined root argument is the default null on both bodies.
    const nullPrevBag = [withPrev(base, null)];
    assertSamePlacement(
      orderByIssuerChain(nullPrevBag, undefined as unknown as string | null),
      orderByIssuerChain(nullPrevBag, null),
    );
    assertSamePlacement(
      orderByIssuerChainReference(nullPrevBag, undefined as unknown as string | null),
      orderByIssuerChainReference(nullPrevBag, null),
    );
    const cases: Array<{ prev: unknown; root: unknown; expectOrdered: boolean }> = [
      { prev: undefined, root: null, expectOrdered: false },
      { prev: null, root: null, expectOrdered: true },
      { prev: 0, root: 0, expectOrdered: true },
      { prev: -0, root: -0, expectOrdered: true },
      { prev: 0, root: -0, expectOrdered: true },
      { prev: -0, root: 0, expectOrdered: true },
    ];
    for (const c of cases) {
      const receipt = withPrev(base, c.prev);
      const root = c.root as string | null;
      assertSamePlacement(orderByIssuerChain([receipt], root), orderByIssuerChainReference([receipt], root));
      const live = orderByIssuerChain([receipt], root);
      if (c.expectOrdered) {
        assert.deepEqual(live, { ordered: [receipt], leftover: [] });
      } else {
        assert.deepEqual(live, { ordered: [], leftover: [receipt] });
      }
    }
  });

  it("matches reference hole and hole-adjacent bag behaviour", () => {
    const keys = generateReceiptKeys();
    const a = signOne(keys, null, "holeA", NOW);
    const b = signOne(keys, receiptHash(a), "holeB", NOW + 1);

    const len1 = Array(1) as SignedReceipt[];
    assertSamePlacement(orderByIssuerChain(len1, null), orderByIssuerChainReference(len1, null));
    assert.deepEqual(orderByIssuerChain(len1, null), { ordered: [], leftover: [undefined] });

    const holeStart = Array(3) as SignedReceipt[];
    holeStart[1] = a;
    holeStart[2] = b;
    assertThrowsClaimsRead(() => orderByIssuerChain(holeStart, null));
    assertThrowsClaimsRead(() => orderByIssuerChainReference(holeStart, null));

    const holeMid = Array(3) as SignedReceipt[];
    holeMid[0] = a;
    holeMid[2] = b;
    assertThrowsClaimsRead(() => orderByIssuerChain(holeMid, null));
    assertThrowsClaimsRead(() => orderByIssuerChainReference(holeMid, null));

    const holeEnd = Array(3) as SignedReceipt[];
    holeEnd[0] = a;
    holeEnd[1] = b;
    assertThrowsClaimsRead(() => orderByIssuerChain(holeEnd, null));
    assertThrowsClaimsRead(() => orderByIssuerChainReference(holeEnd, null));

    assertThrowsClaimsRead(() => orderByIssuerChain([undefined as unknown as SignedReceipt], null));
    assertThrowsClaimsRead(() => orderByIssuerChainReference([undefined as unknown as SignedReceipt], null));
    assertThrowsClaimsRead(() => orderByIssuerChain([null as unknown as SignedReceipt], null));
    assertThrowsClaimsRead(() => orderByIssuerChainReference([null as unknown as SignedReceipt], null));
  });
});

describe("findCheckpointTotalMismatches defers issuer ordering", () => {
  it("empty checkpoints with a broken receipt return [] without throwing", () => {
    assert.deepEqual(findCheckpointTotalMismatches([{} as never], []), []);
  });

  it("unverifiable checkpoints leave a broken receipt bag unordered", () => {
    const cp = {
      claims: {
        epoch: 1,
        startMs: NOW,
        endMs: NOW + WINDOW,
        prevCheckpointHash: null,
        receiptCount: 0,
        totals: null,
        chainHeadHash: null,
      },
      encoding: "cose",
      coseHex: "00",
    } as SignedCheckpoint;
    const findings = findCheckpointTotalMismatches(
      [{} as never],
      [cp],
      () => ({}),
      "spend",
      {
        record: "receipt",
        row: "settlement",
        extract: "rail extract",
        extractKey: "rail key",
        scope: "settlement path",
        account: "account",
        rail: "rail",
        issuer: "issuer",
      },
      null,
      null,
      () => false,
    );
    assert.ok(findings.length >= 1);
    assert.ok(findings.every((f) => f.code === "checkpoint-total-mismatch"));
  });

  it("orders the issuer chain once across many verifying checkpoints", () => {
    const issuer = generateReceiptKeys();
    const receipts = straightChain(issuer, 3);
    const cps: SignedCheckpoint[] = [];
    let prevHash: string | null = null;
    for (let i = 0; i < 8; i += 1) {
      const start = NOW + i * WINDOW;
      const end = start + WINDOW;
      const inWindow = i === 0 ? receipts : [];
      const cp = signCheckpoint(
        buildCheckpointClaims(i + 1, inWindow, start, end, prevHash),
        issuer.privateKeyPem,
        issuer.publicKeyPem,
      );
      cps.push(cp);
      prevHash = checkpointHash(cp);
    }
    const reads = withPrevReceiptHashReads(receipts, (wrapped) => {
      findCheckpointTotalMismatches(wrapped, cps, undefined, "spend", undefined, null, null, () => true);
    });
    const n = receipts.length;
    assert.ok(reads <= 4 * n, `expected a single ordering pass, got reads=${reads} for N=${n}`);
  });
});

describe("orderByIssuerChain read linearity", () => {
  it("reads claims.prevReceiptHash at most c*N on a straight chain of N", () => {
    const keys = generateReceiptKeys();
    const n = 64;
    const c = 4;
    const receipts = straightChain(keys, n);
    const reads = withPrevReceiptHashReads(receipts, (wrapped) => {
      orderByIssuerChain(wrapped, null);
    });
    assert.ok(
      reads <= c * n,
      `expected prevReceiptHash reads <= ${c * n} for N=${n}, got ${reads}`,
    );
  });
});

describe("audit orders the issuer chain a fixed number of times", () => {
  it("prevReceiptHash reads do not scale with checkpoint count", () => {
    const issuer = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipts = straightChain(issuer, 4);
    const settlements = receipts.map((r) => ({
      ref: r.claims.x402PaymentRef ?? r.claims.nonce,
      amount: r.claims.amount,
      currency: r.claims.currency,
      timestampMs: r.claims.timestampMs,
    }));

    function checkpoints(count: number): SignedCheckpoint[] {
      const out: SignedCheckpoint[] = [];
      let prevHash: string | null = null;
      for (let i = 0; i < count; i += 1) {
        const start = NOW + i * WINDOW;
        const end = start + WINDOW;
        const inWindow = i === 0 ? receipts : [];
        const cp = signCheckpoint(
          buildCheckpointClaims(i + 1, inWindow, start, end, prevHash),
          issuer.privateKeyPem,
          issuer.publicKeyPem,
        );
        out.push(cp);
        prevHash = checkpointHash(cp);
      }
      return out;
    }

    function readCount(cpCount: number): number {
      const cps = checkpoints(cpCount);
      const extract = signRailExtract(
        {
          accountId: "acct",
          railId: "rail",
          windowStartMs: NOW,
          windowEndMs: NOW + WINDOW,
          settlements,
        },
        rail.privateKeyPem,
        rail.publicKeyPem,
      );
      return withPrevReceiptHashReads(receipts, (wrapped) => {
        audit({
          receipts: wrapped,
          checkpoints: cps,
          extract,
          issuerTrust: { publicKeyPem: issuer.publicKeyPem },
          trust: {
            publicKeyPem: rail.publicKeyPem,
            accountId: "acct",
            railId: "rail",
            windowStartMs: NOW,
            windowEndMs: NOW + WINDOW,
          },
        });
      });
    }

    const reads8 = readCount(8);
    const reads64 = readCount(64);
    assert.ok(
      reads64 < reads8 * 2,
      `expected checkpoint-independent ordering reads, got reads8=${reads8} reads64=${reads64}`,
    );
  });
});
