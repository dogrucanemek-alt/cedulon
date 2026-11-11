import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  audit,
  AUDIT_MAX_SETTLEMENTS,
  findSettlementMatches,
  type Finding,
} from "@cedulon/audit";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";
import { generateReceiptKeys, signReceipt, type SpendReceiptClaims } from "@cedulon/receipts";
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
    // Quadratic path: per skipped ref, find plus two full filters over 2N items.
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
});
