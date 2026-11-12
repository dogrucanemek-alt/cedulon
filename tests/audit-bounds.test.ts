import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  audit,
  AUDIT_MAX_SETTLEMENTS,
  DECISION_PROFILE,
  findSettlementMatches,
  SPEND_PROFILE,
  type Finding,
} from "@cedulon/audit";
import { generateEffectExtractKeys, signEffectExtract } from "@cedulon/effect-extract";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";
import { generateReceiptKeys, signReceipt, type SpendReceiptClaims, type SignedReceipt } from "@cedulon/receipts";
import { TEST_HASH } from "./hash-fixtures.ts";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

function row(ref: string, amount: string, timestampMs: number) {
  return { ref, amount, currency: "USD", timestampMs };
}

function flood(n: number, timestampMs: number) {
  return Array.from({ length: n }, (_, i) => row(`flood-${i}`, "1", timestampMs + i));
}

function signedExtract(
  settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }>,
  windowStartMs: number,
  windowEndMs: number,
) {
  const rail = generateExtractKeys();
  return signRailExtract(
    {
      accountId: "mock-account",
      railId: "mock-rail",
      windowStartMs,
      windowEndMs,
      settlements,
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function withSettlements<T extends { body: { settlements: unknown } }>(
  extract: T,
  settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }>,
): T {
  return { ...extract, body: { ...extract.body, settlements } };
}

/**
 * Counts predicate calls through Array.prototype.find/filter while `fn` runs.
 * classifySettlementMatches copies the caller's rows, so a Proxy on the input
 * array cannot see the later per-ref rescans; the prototype wrap can.
 */
function withScanCounts(fn: () => void): number {
  let scans = 0;
  const originalFind = Array.prototype.find;
  const originalFilter = Array.prototype.filter;
  Array.prototype.find = function (this: unknown[], predicate: (value: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown) {
    return originalFind.call(
      this,
      (value, index, array) => {
        scans += 1;
        return predicate.call(thisArg, value, index, array);
      },
    );
  };
  Array.prototype.filter = function (this: unknown[], predicate: (value: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown) {
    return originalFilter.call(
      this,
      (value, index, array) => {
        scans += 1;
        return predicate.call(thisArg, value, index, array);
      },
    );
  };
  try {
    fn();
  } finally {
    Array.prototype.find = originalFind;
    Array.prototype.filter = originalFilter;
  }
  return scans;
}

function claims(ref: string, amount: string, nonce: string): SpendReceiptClaims {
  return {
    payer: "payer",
    payee: "payee-1",
    amount,
    currency: "USD",
    policyHash: TEST_HASH,
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: ref,
    timestampMs: NOW + 1,
    nonce,
    prevReceiptHash: null,
    outcome: "settled",
  };
}

type RowLike = { ref: unknown; amount: string; currency: string; timestampMs: number };

/**
 * Master-era grouping for duplicate refs: count with a Map, then resolve the
 * side label via `items.find((x) => x.ref === ref)` (so NaN falls back to
 * "item"). Aggregate membership also uses `===`. Lives only in this test.
 */
function masterStylePushDuplicateRefs(
  items: Array<{ ref: unknown; id: unknown; side: string; receipt?: SignedReceipt; settlement?: RowLike }>,
  findings: Finding[],
): Set<unknown> {
  const seen = new Map<unknown, number>();
  for (const item of items) {
    seen.set(item.ref, (seen.get(item.ref) ?? 0) + 1);
  }
  const dupes = new Set<unknown>();
  for (const [ref, n] of seen) {
    if (n > 1) {
      dupes.add(ref);
      findings.push({
        code: "duplicate-ref",
        id: ref as string,
        detail: `${items.find((x) => x.ref === ref)?.side ?? "item"} ref ${String(ref)} appears ${n} times`,
      });
    }
  }
  return dupes;
}

function masterStyleFindSettlementMatches(
  receipts: SignedReceipt[],
  settlements: RowLike[],
): Finding[] {
  const profile = SPEND_PROFILE;
  const findings: Finding[] = [];
  const settled = receipts.filter((r) => profile.expectsRow(r));
  const refusalRefs = new Set(
    receipts
      .filter((r) => !profile.expectsRow(r))
      .map((r) => profile.recordRef(r))
      .filter((ref): ref is string => ref !== null),
  );
  const receiptItems = settled
    .map((r) => ({ ref: profile.recordRef(r) as unknown, id: r.claims.nonce, side: profile.words.record, receipt: r }))
    .filter((x): x is typeof x & { ref: unknown } => x.ref !== null);
  const settlementItems = settlements.map((s) => ({
    ref: s.ref,
    id: s.ref,
    side: profile.words.row,
    settlement: s,
  }));
  const dupeReceipt = masterStylePushDuplicateRefs(receiptItems, []);
  const dupeSettlement = masterStylePushDuplicateRefs(settlementItems, findings);
  const skip = new Set<unknown>([...dupeReceipt, ...dupeSettlement]);
  for (const ref of skip) {
    const records = receiptItems.filter((item) => item.ref === ref).map((item) => item.receipt!);
    const rows = settlementItems.filter((item) => item.ref === ref).map((item) => item.settlement!) as Parameters<
      typeof profile.aggregate
    >[2];
    for (const f of profile.aggregate(ref as string, records, rows)) {
      findings.push({
        code: f.code as Finding["code"],
        id: f.id,
        detail: f.detail,
        ...(f.severity ? { severity: f.severity } : {}),
      });
    }
  }
  const receiptsByRef = new Map<unknown, SignedReceipt>();
  for (const item of receiptItems) {
    if (!skip.has(item.ref)) receiptsByRef.set(item.ref, item.receipt!);
  }
  const settlementsByRef = new Map<unknown, RowLike>();
  for (const item of settlementItems) {
    if (!skip.has(item.ref)) settlementsByRef.set(item.ref, item.settlement!);
  }
  for (const [ref, s] of settlementsByRef) {
    const r = receiptsByRef.get(ref);
    if (!r) {
      const againstRefusal = typeof ref === "string" && refusalRefs.has(ref);
      findings.push({
        code: (againstRefusal
          ? profile.codes.rowAgainstRefusal
          : profile.codes.rowWithoutRecord) as Finding["code"],
        id: ref as string,
        detail: againstRefusal
          ? profile.rowAgainstRefusalDetail(s as never)
          : profile.rowWithoutRecordDetail(s as never),
      });
      continue;
    }
    const bound = profile.bind(r, s as never);
    if (!bound.ok) {
      findings.push({
        code: (bound.code ?? profile.codes.bindFailure) as Finding["code"],
        id: ref as string,
        detail: bound.detail,
      });
    }
  }
  for (const [ref, r] of receiptsByRef) {
    if (!settlementsByRef.has(ref)) {
      findings.push({
        code: profile.codes.recordWithoutRow as Finding["code"],
        id: r.claims.nonce,
        detail: profile.recordWithoutRowDetail(r, ref as string),
      });
    }
  }
  return findings;
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

describe("audit input bounds on every presented row array", () => {
  it("refuses a separate settlements array above the bound when an extract is also present", () => {
    const extract = signedExtract([row("ok", "1", NOW)], NOW, WINDOW_END);
    const over = flood(AUDIT_MAX_SETTLEMENTS + 1, NOW);
    assert.throws(
      () => audit({ receipts: [], checkpoints: [], extract, settlements: over }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code?: string }).code, "audit-too-large");
        assert.match(
          err.message,
          new RegExp(
            `^audit-too-large: settlements ${AUDIT_MAX_SETTLEMENTS + 1} > ${AUDIT_MAX_SETTLEMENTS}; split the window$`,
          ),
        );
        return true;
      },
    );
  });

  it("accepts a separate settlements array at the bound and refuses one above it", () => {
    const extract = signedExtract([row("ok", "1", NOW)], NOW, WINDOW_END);
    const at = flood(AUDIT_MAX_SETTLEMENTS, NOW);
    assert.doesNotThrow(() => audit({ receipts: [], checkpoints: [], extract, settlements: at }));
    const over = flood(AUDIT_MAX_SETTLEMENTS + 1, NOW);
    assert.throws(
      () => audit({ receipts: [], checkpoints: [], extract, settlements: over }),
      (err: unknown) => {
        assert.equal((err as Error & { code?: string }).code, "audit-too-large");
        return true;
      },
    );
  });

  it("refuses nextExtract rows above the bound before reconciliation", () => {
    const extract = signedExtract([], NOW, WINDOW_END);
    const next = withSettlements(
      signedExtract([], WINDOW_END, WINDOW_END + 3_600_000),
      flood(AUDIT_MAX_SETTLEMENTS + 1, WINDOW_END),
    );
    assert.throws(
      () => audit({ receipts: [], checkpoints: [], extract, nextExtract: next }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code?: string }).code, "audit-too-large");
        assert.match(
          err.message,
          new RegExp(
            `^audit-too-large: settlements ${AUDIT_MAX_SETTLEMENTS + 1} > ${AUDIT_MAX_SETTLEMENTS}; split the window$`,
          ),
        );
        return true;
      },
    );
    const at = withSettlements(
      signedExtract([], WINDOW_END, WINDOW_END + 3_600_000),
      flood(AUDIT_MAX_SETTLEMENTS, WINDOW_END),
    );
    assert.doesNotThrow(() => audit({ receipts: [], checkpoints: [], extract, nextExtract: at }));
  });

  it("refuses previousExtract rows above the bound before reconciliation", () => {
    const extract = signedExtract([], NOW, WINDOW_END);
    const previous = withSettlements(
      signedExtract([], NOW - 3_600_000, NOW),
      flood(AUDIT_MAX_SETTLEMENTS + 1, NOW - 3_600_000),
    );
    assert.throws(
      () => audit({ receipts: [], checkpoints: [], extract, previousExtract: previous }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code?: string }).code, "audit-too-large");
        assert.match(
          err.message,
          new RegExp(
            `^audit-too-large: settlements ${AUDIT_MAX_SETTLEMENTS + 1} > ${AUDIT_MAX_SETTLEMENTS}; split the window$`,
          ),
        );
        return true;
      },
    );
    const at = withSettlements(
      signedExtract([], NOW - 3_600_000, NOW),
      flood(AUDIT_MAX_SETTLEMENTS, NOW - 3_600_000),
    );
    assert.doesNotThrow(() =>
      audit({ receipts: [], checkpoints: [], extract, previousExtract: at }),
    );
  });

  it("leaves a neighbour extract with a null body on master's report path", () => {
    const extract = signedExtract([row("ok", "1", NOW)], NOW, WINDOW_END);
    const neighbor = { body: null, signature: "", publicKeyPem: "" };
    const nextReport = audit({
      receipts: [],
      checkpoints: [],
      extract,
      nextExtract: neighbor as never,
    });
    assert.equal(nextReport.ok, true);
    assert.equal(nextReport.findings.length, 0);
    const prevReport = audit({
      receipts: [],
      checkpoints: [],
      extract,
      previousExtract: neighbor as never,
    });
    assert.equal(prevReport.ok, true);
    assert.equal(prevReport.findings.length, 0);
  });

  it("treats null settlements as absent the way master did", () => {
    const extract = signedExtract([row("ok", "1", NOW)], NOW, WINDOW_END);
    const withExtract = audit({
      receipts: [],
      checkpoints: [],
      extract,
      settlements: null as never,
    });
    assert.equal(withExtract.ok, true);
    assert.equal(withExtract.findings.length, 0);
    const withoutExtract = audit({
      receipts: [],
      checkpoints: [],
      settlements: null as never,
    });
    assert.equal(withoutExtract.ok, true);
  });

  it("a settlements value that is not a list fails as unreadable input beside an extract", () => {
    const extract = signedExtract([row("ok", "1", NOW)], NOW, WINDOW_END);
    const length4097 = audit({
      receipts: [],
      checkpoints: [],
      extract,
      settlements: { length: 4097 } as never,
    });
    assert.equal(length4097.ok, false);
    assert.equal(length4097.findings.length, 1);
    assert.equal(length4097.findings[0]?.code, "presented-object-malformed");
    assert.equal(length4097.findings[0]?.id, "input");
    assert.notEqual(length4097.guarantee, "unconditional");
    const longString = audit({
      receipts: [],
      checkpoints: [],
      extract,
      settlements: "x".repeat(5000) as never,
    });
    assert.equal(longString.ok, false);
    assert.equal(longString.findings.length, 1);
    assert.equal(longString.findings[0]?.code, "presented-object-malformed");
    assert.equal(longString.findings[0]?.id, "input");
    assert.notEqual(longString.guarantee, "unconditional");
    const numberSettlements = audit({
      receipts: [],
      checkpoints: [],
      extract,
      settlements: 5 as never,
    });
    assert.equal(numberSettlements.ok, false);
    assert.equal(numberSettlements.findings.length, 1);
    assert.equal(numberSettlements.findings[0]?.code, "presented-object-malformed");
    assert.equal(numberSettlements.findings[0]?.id, "input");
    assert.notEqual(numberSettlements.guarantee, "unconditional");
    const shortString = audit({
      receipts: [],
      checkpoints: [],
      extract,
      settlements: "x" as never,
    });
    assert.equal(shortString.ok, false);
    assert.ok(
      shortString.findings.some(
        (f) => f.code === "presented-object-malformed" && f.id === "input",
      ),
    );
    assert.notEqual(shortString.guarantee, "unconditional");
    const lengthOne = audit({
      receipts: [],
      checkpoints: [],
      extract,
      settlements: { length: 1 } as never,
    });
    assert.equal(lengthOne.ok, false);
    assert.ok(
      lengthOne.findings.some(
        (f) => f.code === "presented-object-malformed" && f.id === "input",
      ),
    );
    assert.notEqual(lengthOne.guarantee, "unconditional");
  });

  it("keeps master's non-array settlements outcomes without an extract", () => {
    assert.throws(
      () => audit({ receipts: [], checkpoints: [], settlements: { length: 4097 } as never }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code?: string }).code, "audit-too-large");
        assert.match(
          err.message,
          new RegExp(`^audit-too-large: settlements 4097 > ${AUDIT_MAX_SETTLEMENTS}; split the window$`),
        );
        return true;
      },
    );
    assert.throws(
      () => audit({ receipts: [], checkpoints: [], settlements: "x".repeat(5000) as never }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { code?: string }).code, "audit-too-large");
        assert.match(
          err.message,
          new RegExp(`^audit-too-large: settlements 5000 > ${AUDIT_MAX_SETTLEMENTS}; split the window$`),
        );
        return true;
      },
    );
    const numberSettlements = audit({
      receipts: [],
      checkpoints: [],
      settlements: 5 as never,
    });
    assert.equal(numberSettlements.ok, false);
    assert.ok(
      numberSettlements.findings.some(
        (f) => f.code === "presented-object-malformed" && f.id === "input",
      ),
    );
    assert.notEqual(numberSettlements.guarantee, "unconditional");
  });

  it("leaves neighbour extracts with non-array row fields on master's report path", () => {
    const extract = signedExtract([], NOW, WINDOW_END);
    const nonArrays: unknown[] = [{ length: 4097 }, "x".repeat(5000), 5, { length: 1 }, "x"];
    for (const settlements of nonArrays) {
      const next = withSettlements(
        signedExtract([], WINDOW_END, WINDOW_END + 3_600_000),
        settlements as never,
      );
      const nextReport = audit({
        receipts: [],
        checkpoints: [],
        extract,
        nextExtract: next as never,
      });
      assert.equal(nextReport.ok, true, `next ${String(settlements)}`);
      assert.equal(nextReport.findings.length, 0, `next ${String(settlements)}`);
      const previous = withSettlements(
        signedExtract([], NOW - 3_600_000, NOW),
        settlements as never,
      );
      const prevReport = audit({
        receipts: [],
        checkpoints: [],
        extract,
        previousExtract: previous as never,
      });
      assert.equal(prevReport.ok, true, `prev ${String(settlements)}`);
      assert.equal(prevReport.findings.length, 0, `prev ${String(settlements)}`);
    }
  });

  it("leaves neighbour effect extracts with non-array effects on master's report path", () => {
    const keys = generateEffectExtractKeys();
    const signedEffect = (
      effects: Array<{ ref: string; effectHash: string; effectClass: string; timestampMs: number }>,
      windowStartMs: number,
      windowEndMs: number,
    ) =>
      signEffectExtract(
        {
          deciderId: "decider-1",
          channelId: "ig-dm",
          windowStartMs,
          windowEndMs,
          effects,
        },
        keys.privateKeyPem,
        keys.publicKeyPem,
      );
    const withEffects = <T extends { body: { effects: unknown } }>(base: T, effects: unknown): T =>
      ({ ...base, body: { ...base.body, effects } });
    const empty = signedEffect([], NOW, WINDOW_END);
    const nonArrays: unknown[] = [{ length: 4097 }, "x".repeat(5000), 5];
    for (const effects of nonArrays) {
      const next = withEffects(signedEffect([], WINDOW_END, WINDOW_END + 3_600_000), effects);
      const nextReport = audit({
        receipts: [],
        checkpoints: [],
        extract: empty,
        nextExtract: next as never,
        profile: DECISION_PROFILE,
      });
      assert.equal(nextReport.ok, true);
      assert.equal(nextReport.findings.length, 0);
      const previous = withEffects(signedEffect([], NOW - 3_600_000, NOW), effects);
      const prevReport = audit({
        receipts: [],
        checkpoints: [],
        extract: empty,
        previousExtract: previous as never,
        profile: DECISION_PROFILE,
      });
      assert.equal(prevReport.ok, true);
      assert.equal(prevReport.findings.length, 0);
    }
  });
});

describe("settlement match ref grouping is linear", () => {
  it("find/filter scans stay within a linear bound for N distinct repeated refs", () => {
    const N = 80;
    const settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }> = [];
    for (let i = 0; i < N; i++) {
      settlements.push(row(`dup-${i}`, "1", NOW + i));
      settlements.push(row(`dup-${i}`, "2", NOW + i));
    }
    let findings: Finding[] = [];
    const scans = withScanCounts(() => {
      findings = findSettlementMatches([], settlements);
    });
    assert.equal(findings.filter((f) => f.code === "duplicate-ref").length, N);
    // Quadratic path: per skipped ref, find over the group plus one filter over
    // the settlement items (receipt list is empty here, so that filter is idle).
    // Linear grouping keeps total predicate visits under c*N.
    assert.ok(scans < 40 * N, `expected linear find/filter scans, got ${scans} for N=${N}`);
  });

  it("duplicate settlement ref findings match the hand-written shape", () => {
    const settlements = [
      row("shared", "1", NOW),
      row("shared", "2", NOW + 1),
      row("solo", "3", NOW + 2),
    ];
    const findings = findSettlementMatches([], settlements);
    assert.deepEqual(
      findings.map((f: Finding) => ({ code: f.code, id: f.id, detail: f.detail })),
      [
        {
          code: "duplicate-ref",
          id: "shared",
          detail: "settlement ref shared appears 2 times",
        },
        {
          code: "settlement-without-receipt",
          id: "shared",
          detail: "ref shared settled 3 USD against 0 USD receipted; 3 USD unaccounted",
        },
        {
          code: "settlement-without-receipt",
          id: "solo",
          detail: "settlement solo 3 USD has no spend receipt",
        },
      ],
    );
  });

  it("skipped receipt refs still aggregate without emitting receipt duplicate-ref here", () => {
    const keys = generateReceiptKeys();
    const a = signReceipt(claims("same", "1", "nonce-a".padEnd(16, "-")), keys.privateKeyPem, keys.publicKeyPem);
    const b = signReceipt(claims("same", "2", "nonce-b".padEnd(16, "-")), keys.privateKeyPem, keys.publicKeyPem);
    const findings = findSettlementMatches([a, b], []);
    assert.deepEqual(
      findings.map((f: Finding) => ({ code: f.code, id: f.id, detail: f.detail })),
      [
        {
          code: "settlement-mismatch",
          id: "same",
          detail: "ref same settled 0 USD against 3 USD receipted",
        },
      ],
    );
  });

  it("mixed skipped refs keep settlement duplicate then aggregate then unmatched order", () => {
    const keys = generateReceiptKeys();
    const r1 = signReceipt(claims("both", "5", "nonce-1".padEnd(16, "-")), keys.privateKeyPem, keys.publicKeyPem);
    const r2 = signReceipt(claims("both", "5", "nonce-2".padEnd(16, "-")), keys.privateKeyPem, keys.publicKeyPem);
    const settlements = [row("both", "4", NOW), row("both", "4", NOW + 1), row("rail-only", "9", NOW + 2)];
    const findings = findSettlementMatches([r1, r2], settlements);
    assert.deepEqual(
      findings.map((f: Finding) => ({ code: f.code, id: f.id, detail: f.detail })),
      [
        {
          code: "duplicate-ref",
          id: "both",
          detail: "settlement ref both appears 2 times",
        },
        {
          code: "settlement-mismatch",
          id: "both",
          detail: "ref both settled 8 USD against 10 USD receipted",
        },
        {
          code: "settlement-without-receipt",
          id: "rail-only",
          detail: "settlement rail-only 9 USD has no spend receipt",
        },
      ],
    );
  });

  it("non-string duplicate refs keep master's detail text and order", () => {
    const cases: Array<{ label: string; refs: unknown[]; detail: string; extraCodes: string[] }> = [
      { label: "NaN", refs: [NaN, NaN], detail: "item ref NaN appears 2 times", extraCodes: [] },
      {
        label: "undefined",
        refs: [undefined, undefined],
        detail: "settlement ref undefined appears 2 times",
        extraCodes: ["settlement-without-receipt"],
      },
      {
        label: "null",
        refs: [null, null],
        detail: "settlement ref null appears 2 times",
        extraCodes: ["settlement-without-receipt"],
      },
      {
        label: "number",
        refs: [7, 7],
        detail: "settlement ref 7 appears 2 times",
        extraCodes: ["settlement-without-receipt"],
      },
    ];
    for (const c of cases) {
      const settlements = c.refs.map((ref, i) => ({
        ref,
        amount: String(i + 1),
        currency: "USD",
        timestampMs: NOW + i,
      })) as never;
      const findings = findSettlementMatches([], settlements);
      assert.equal(findings[0]?.code, "duplicate-ref", c.label);
      assert.equal(findings[0]?.detail, c.detail, c.label);
      assert.deepEqual(
        findings.slice(1).map((f) => f.code),
        c.extraCodes,
        c.label,
      );
    }
    const objectSettlements = [
      { ref: { a: 1 }, amount: "1", currency: "USD", timestampMs: NOW },
      { ref: { a: 1 }, amount: "2", currency: "USD", timestampMs: NOW + 1 },
    ] as never;
    const objectFindings = findSettlementMatches([], objectSettlements);
    assert.deepEqual(
      objectFindings.map((f) => ({ code: f.code, detail: f.detail })),
      [
        {
          code: "settlement-without-receipt",
          detail: "settlement [object Object] 1 USD has no spend receipt",
        },
        {
          code: "settlement-without-receipt",
          detail: "settlement [object Object] 2 USD has no spend receipt",
        },
      ],
    );
  });

  it("seeded random row sets match the copied master grouping reference", () => {
    const rand = mulberry32(0xced01);
    const keys = generateReceiptKeys();
    const refPool: unknown[] = [
      "alpha",
      "beta",
      "",
      "__proto__",
      "constructor",
      NaN,
      undefined,
      null,
      0,
      1,
      { tag: "obj" },
    ];
    for (let trial = 0; trial < 40; trial++) {
      const settlements: RowLike[] = [];
      const nRows = 1 + Math.floor(rand() * 8);
      for (let i = 0; i < nRows; i++) {
        const ref = refPool[Math.floor(rand() * refPool.length)];
        settlements.push({
          ref,
          amount: String(1 + Math.floor(rand() * 5)),
          currency: "USD",
          timestampMs: NOW + i,
        });
        if (rand() < 0.45) {
          settlements.push({
            ref,
            amount: String(1 + Math.floor(rand() * 5)),
            currency: "USD",
            timestampMs: NOW + 100 + i,
          });
        }
      }
      const receipts: SignedReceipt[] = [];
      if (rand() < 0.7) {
        const ref = refPool[Math.floor(rand() * refPool.length)];
        if (typeof ref === "string") {
          const n = 1 + Math.floor(rand() * 2);
          for (let i = 0; i < n; i++) {
            receipts.push(
              signReceipt(
                claims(ref, String(1 + Math.floor(rand() * 5)), `n${trial}-${i}`.padEnd(16, "-")),
                keys.privateKeyPem,
                keys.publicKeyPem,
              ),
            );
          }
        }
      }
      const actual = findSettlementMatches(receipts, settlements as never);
      const expected = masterStyleFindSettlementMatches(receipts, settlements);
      assert.deepEqual(
        actual.map((f) => ({ code: f.code, id: f.id, detail: f.detail })),
        expected.map((f) => ({ code: f.code, id: f.id, detail: f.detail })),
        `trial ${trial}`,
      );
    }
  });
});
