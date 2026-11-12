/**
 * Safety net around audit / auditWindows: evidence and config throws become
 * one fixed report; only stamped audit-too-large escapes. Walk matches master.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIT_MAX_CHECKPOINTS,
  AUDIT_MAX_INCLUSIONS,
  AUDIT_MAX_RECEIPTS,
  AUDIT_MAX_SETTLEMENTS,
  FINDING_CODES,
  SPEND_PROFILE,
  audit,
  auditWindows,
  formatAudit,
  type AuditReport,
  type ReconciliationProfile,
} from "@cedulon/audit";
import { generateManifestKeys } from "@cedulon/manifest";
import { counterSign, generateReceiptKeys, signReceipt } from "@cedulon/receipts";

const SAFETY_NET_DETAIL =
  "the audit input or its configuration could not be read; no report could be computed";

const EMPTY_COUNTS = {
  receipts: {
    submitted: 0,
    attested: 0,
    inScope: 0,
    aborted: 0,
    settled: 0,
    matched: 0,
    deferred: 0,
    carried: 0,
    unmatched: 0,
    repeated: 0,
    unreconciled: 0,
  },
  settlements: {
    rows: 0,
    matched: 0,
    deferred: 0,
    unmatched: 0,
    repeated: 0,
    unreconciled: 0,
  },
} as const;

const FIXED_SAFETY_REPORT: AuditReport = {
  ok: false,
  findings: [{ code: "presented-object-malformed", id: "input", detail: SAFETY_NET_DETAIL }],
  warnings: [],
  guarantee: "conditional",
  summary: "audit: 1 finding(s) → FAIL",
  counts: structuredClone(EMPTY_COUNTS),
};

function snap(report: AuditReport) {
  return {
    ok: report.ok,
    guarantee: report.guarantee,
    summary: report.summary,
    findings: report.findings.map((f) => ({
      code: f.code,
      id: f.id,
      detail: f.detail,
      ...(f.severity !== undefined ? { severity: f.severity } : {}),
    })),
    warnings: report.warnings.map((w) => ({
      code: w.code,
      id: w.id,
      detail: w.detail,
      ...(w.severity !== undefined ? { severity: w.severity } : {}),
      ...(w.needs !== undefined ? { needs: w.needs } : {}),
    })),
    counts: report.counts,
    ...(report.scope !== undefined ? { scope: report.scope } : {}),
  };
}

function assertFixedSafety(report: AuditReport): void {
  assert.deepEqual(snap(report), snap(FIXED_SAFETY_REPORT));
  const text = formatAudit(report);
  assert.match(text, /^result\tfail findings=1$/m);
  assert.doesNotMatch(text, /^result\tbalanced/m);
}

const H = "a".repeat(64);

const MASTER_EQUIV: Record<string, ReturnType<typeof snap>> = {
  "policyHash-0": {
    ok: false,
    guarantee: "conditional",
    summary: "audit: 2 finding(s) → FAIL",
    findings: [
      {
        code: "malformed-policy-hash",
        id: "n",
        detail: "policyHash 0 is not 64-character lowercase hex SHA-256",
      },
      {
        code: "receipt-chain-break",
        id: "n",
        detail:
          "receipt 0 refused: receipt-not-cose - outside the core profile (MUST-T4-1), not a signature verdict",
      },
    ],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "unauthenticated-issuer",
        id: "issuer",
        detail:
          "no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them. Without one there is no way to tell a receipt from this issuer apart from any other, so every receipt submitted is weighed as one set and the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: {
      receipts: {
        submitted: 1,
        attested: 0,
        inScope: 0,
        aborted: 0,
        settled: 0,
        matched: 0,
        deferred: 0,
        carried: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
      settlements: {
        rows: 0,
        matched: 0,
        deferred: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
    },
  },
  "encoding-0": {
    ok: false,
    guarantee: "conditional",
    summary: "audit: 1 finding(s) → FAIL",
    findings: [
      {
        code: "receipt-chain-break",
        id: "n",
        detail:
          "receipt 0 refused: receipt-not-cose - outside the core profile (MUST-T4-1), not a signature verdict",
      },
    ],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "unauthenticated-issuer",
        id: "issuer",
        detail:
          "no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them. Without one there is no way to tell a receipt from this issuer apart from any other, so every receipt submitted is weighed as one set and the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: {
      receipts: {
        submitted: 1,
        attested: 0,
        inScope: 0,
        aborted: 0,
        settled: 0,
        matched: 0,
        deferred: 0,
        carried: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
      settlements: {
        rows: 0,
        matched: 0,
        deferred: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
    },
  },
  "encoding-json-coseHex-null": {
    ok: false,
    guarantee: "conditional",
    summary: "audit: 1 finding(s) → FAIL",
    findings: [
      {
        code: "receipt-chain-break",
        id: "n",
        detail:
          "receipt 0 refused: receipt-not-cose - outside the core profile (MUST-T4-1), not a signature verdict",
      },
    ],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "unauthenticated-issuer",
        id: "issuer",
        detail:
          "no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them. Without one there is no way to tell a receipt from this issuer apart from any other, so every receipt submitted is weighed as one set and the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: {
      receipts: {
        submitted: 1,
        attested: 0,
        inScope: 0,
        aborted: 0,
        settled: 0,
        matched: 0,
        deferred: 0,
        carried: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
      settlements: {
        rows: 0,
        matched: 0,
        deferred: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
    },
  },
  "extract-accountId-0": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "rail extract body was refused: missing-extract-accountId - not a signature verdict; no rail key was pinned and the completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "counterparty-unbound",
        id: "counterparty",
        severity: "warn",
        detail:
          "counterparty identity was not bound: no manifest states a payee and no reconciled row names a beneficiary, so `ref`, amount and currency are the whole of what ties these settlements to these receipts, whatever the reconciliation itself found",
      },
    ],
    counts: {
      receipts: {
        submitted: 0,
        attested: 0,
        inScope: 0,
        aborted: 0,
        settled: 0,
        matched: 0,
        deferred: 0,
        carried: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
      settlements: {
        rows: 0,
        matched: 0,
        deferred: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
    },
    scope: { accountId: 0 as unknown as string, railId: "r", windowStartMs: 1, windowEndMs: 2 },
  },
  "extract-windowStartMs-bad": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "rail extract body was refused: malformed-extract-windowStartMs - not a signature verdict; no rail key was pinned and the completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "counterparty-unbound",
        id: "counterparty",
        severity: "warn",
        detail:
          "counterparty identity was not bound: no manifest states a payee and no reconciled row names a beneficiary, so `ref`, amount and currency are the whole of what ties these settlements to these receipts, whatever the reconciliation itself found",
      },
    ],
    counts: {
      receipts: {
        submitted: 0,
        attested: 0,
        inScope: 0,
        aborted: 0,
        settled: 0,
        matched: 0,
        deferred: 0,
        carried: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
      settlements: {
        rows: 0,
        matched: 0,
        deferred: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
    },
    scope: { accountId: "a", railId: "r", windowStartMs: 1.5, windowEndMs: 2 },
  },
  "checkpoint-epoch-1.5": {
    ok: false,
    guarantee: "conditional",
    summary: "audit: 2 finding(s) → FAIL",
    findings: [
      {
        code: "checkpoint-total-mismatch",
        id: "epoch-1.5",
        detail: "checkpoint epoch 1.5 signature failed",
      },
      {
        code: "checkpoint-total-mismatch",
        id: "checkpoint-chain-0",
        detail: "checkpoint chain bad-signature at 0",
      },
    ],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "unauthenticated-issuer",
        id: "issuer",
        detail:
          "no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them. Without one there is no way to tell a receipt from this issuer apart from any other, so every receipt submitted is weighed as one set and the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: {
      receipts: {
        submitted: 0,
        attested: 0,
        inScope: 0,
        aborted: 0,
        settled: 0,
        matched: 0,
        deferred: 0,
        carried: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
      settlements: {
        rows: 0,
        matched: 0,
        deferred: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
    },
  },
  "extract-null": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: structuredClone(EMPTY_COUNTS),
  },
  "manifest-null": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: structuredClone(EMPTY_COUNTS),
  },
  "anchor-null": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: structuredClone(EMPTY_COUNTS),
  },
  "nextExtract-body-null": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: structuredClone(EMPTY_COUNTS),
  },
  "inclusion-siblings-not-array": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "unauthenticated-witness",
        id: "witness",
        detail:
          "no verifier-supplied witness key; an inclusion receipt verified against the key it carries would say a log exists rather than that the named log anchored anything, so none was verified here and the receipt was left out of the comparison",
        severity: "warn",
      },
      {
        code: "witness-inclusion-not-exercised",
        id: "witness-layer2",
        severity: "warn",
        detail:
          "inclusion receipts were presented and no tier-2 pair was, so log membership was not proven; this says nothing about whether any of those receipts verified, which is the separate question a witness pin answers",
      },
    ],
    counts: structuredClone(EMPTY_COUNTS),
  },
  "settlements-null-with-extract": {
    ok: false,
    guarantee: "conditional",
    summary: "audit: 1 finding(s) → FAIL",
    findings: [
      {
        code: "extract-settlement-mismatch",
        id: "extract",
        detail:
          "caller supplied 1 settlement(s) that differ from the 0 in the signed extract; the extract is authoritative",
      },
    ],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "rail extract signature failed and no rail key was pinned; completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "counterparty-unbound",
        id: "counterparty",
        severity: "warn",
        detail:
          "counterparty identity was not bound: no manifest states a payee and no reconciled row names a beneficiary, so `ref`, amount and currency are the whole of what ties these settlements to these receipts, whatever the reconciliation itself found",
      },
    ],
    counts: structuredClone(EMPTY_COUNTS),
    scope: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2 },
  },
  "settlements-null": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: structuredClone(EMPTY_COUNTS),
  },
  "inclusionReceipts-null": {
    ok: true,
    guarantee: "conditional",
    summary: "audit: balanced",
    findings: [],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: structuredClone(EMPTY_COUNTS),
  },
  "coseHex-obj": {
    ok: false,
    guarantee: "conditional",
    summary: "audit: 4 finding(s) → FAIL",
    findings: [
      {
        code: "malformed-policy-hash",
        id: undefined as unknown as string,
        detail: "policyHash undefined is not 64-character lowercase hex SHA-256",
      },
      {
        code: "malformed-manifest-hash",
        id: undefined as unknown as string,
        detail: "manifestHash undefined is not 64-character lowercase hex SHA-256",
      },
      {
        code: "malformed-prev-receipt-hash",
        id: undefined as unknown as string,
        detail: "prevReceiptHash undefined is not 64-character lowercase hex SHA-256",
      },
      {
        code: "receipt-chain-break",
        id: undefined as unknown as string,
        detail:
          "receipt chain could not place nonce=undefined; issuer order is the prevReceiptHash links, not presentation order",
      },
    ],
    warnings: [
      {
        code: "unauthenticated-extract",
        id: "extract",
        detail:
          "no rail extract was supplied; the rows arrived unsigned, so the completeness guarantee is conditional",
        severity: "warn",
      },
      {
        code: "unauthenticated-issuer",
        id: "issuer",
        detail:
          "no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them. Without one there is no way to tell a receipt from this issuer apart from any other, so every receipt submitted is weighed as one set and the completeness guarantee is conditional",
        severity: "warn",
      },
    ],
    counts: {
      receipts: {
        submitted: 1,
        attested: 0,
        inScope: 0,
        aborted: 0,
        settled: 0,
        matched: 0,
        deferred: 0,
        carried: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
      settlements: {
        rows: 0,
        matched: 0,
        deferred: 0,
        unmatched: 0,
        repeated: 0,
        unreconciled: 0,
      },
    },
  },
};

describe("audit safety net", () => {
  it("lists presented-object-malformed once among finding codes", () => {
    assert.equal(FINDING_CODES.filter((c) => c === "presented-object-malformed").length, 1);
    assert.equal(FINDING_CODES.length, 56);
  });

  it("returns the fixed report for crashing evidence shapes", () => {
    const inputs: unknown[] = [
      { receipts: [null], checkpoints: [] },
      { receipts: [], checkpoints: [null] },
      { receipts: [], checkpoints: [], settlements: [null] },
      { receipts: [], checkpoints: [], extract: { body: null, signature: "", publicKeyPem: "" } },
      { receipts: [{ claims: { policyHash: 1n, nonce: "n" }, coseHex: "" }], checkpoints: [] },
      { receipts: [], checkpoints: [{ claims: { epoch: Symbol("e") }, coseHex: "" }] },
      (() => {
        const o: Record<string, unknown> = { receipts: [], checkpoints: [] };
        Object.defineProperty(o, "extract", {
          enumerable: true,
          get() {
            throw new TypeError("boom");
          },
        });
        return o;
      })(),
      { checkpoints: [] },
      { receipts: undefined, checkpoints: [] },
      { receipts: [], checkpoints: undefined },
      null,
      5,
      "x",
      undefined,
    ];
    for (const input of inputs) {
      assertFixedSafety(audit(input as never));
    }
    // A cyclic top-level object is not walked by master and stays a report.
    const cyclic: Record<string, unknown> = { receipts: [], checkpoints: [] };
    cyclic.self = cyclic;
    const cyclicReport = audit(cyclic as never);
    assert.equal(cyclicReport.findings.some((f) => f.code === "presented-object-malformed"), false);
    const windowsReport = auditWindows({ windows: [null as never] });
    assert.equal(windowsReport.ok, false);
    assert.deepEqual(windowsReport.findings, FIXED_SAFETY_REPORT.findings);
    assert.equal(windowsReport.guarantee, FIXED_SAFETY_REPORT.guarantee);
    assert.equal(windowsReport.summary, FIXED_SAFETY_REPORT.summary);
    assert.equal(windowsReport.windows.length, 0);
    assert.equal(windowsReport.resolved, 0);
  });

  it("broken caller trust configuration returns the fixed report", () => {
    const extract = {
      body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
      signature: "x",
      publicKeyPem: "y",
    };
    const pem = generateManifestKeys().publicKeyPem;
    const manifest = {
      body: {
        description: "one unit",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: H,
        cancelCondition: "none",
        expiresAtMs: 1,
      },
      coseHex: "aa",
      publicKeyPem: pem,
    };
    const configs: unknown[] = [
      { receipts: [], checkpoints: [], issuerTrust: {} },
      { receipts: [], checkpoints: [], issuerTrust: { publicKeyPem: 0 } },
      {
        receipts: [],
        checkpoints: [],
        inclusionReceipts: [{ coseHex: "aa", index: 0 }],
        witnessTrust: { publicKeyPem: 0 },
      },
      { receipts: [], checkpoints: [], witnessTrust: { publicKeyPem: 0 } },
      {
        receipts: [],
        checkpoints: [],
        manifest,
        manifestTrust: { publicKeyPem: new Set([pem]) },
      },
      {
        receipts: [],
        checkpoints: [],
        extract,
        trust: { publicKeyPem: 0 },
      },
      {
        receipts: [],
        checkpoints: [],
        extract,
        trust: { publicKeyPem: [1] },
      },
    ];
    for (const input of configs) {
      assertFixedSafety(audit(input as never));
    }

    const issuer = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const receipt = signReceipt(
      {
        payer: "payer",
        payee: "payee-1",
        amount: "1",
        currency: "USD",
        policyHash: H,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-1",
        timestampMs: 1_700_000_000_000,
        nonce: "n1--------------",
        prevReceiptHash: null,
        outcome: "settled",
      },
      issuer.privateKeyPem,
      issuer.publicKeyPem,
    );
    const countersigned = counterSign(
      receipt,
      payee.privateKeyPem,
      payee.publicKeyPem,
      issuer.publicKeyPem,
    );
    // Non-string payee pin: toSpkiDer calls .trim outside its catch, so master
    // throws and the net returns the fixed failed report.
    assertFixedSafety(
      audit({
        receipts: [countersigned],
        checkpoints: [],
        payeeTrust: { "payee-1": 0 as never },
        issuerTrust: { publicKeyPem: issuer.publicKeyPem },
      } as never),
    );
  });

  it("audit-too-large still throws on four axes with the same message and code", () => {
    const cases: Array<[string, object, string]> = [
      [
        "receipts",
        { receipts: new Array(AUDIT_MAX_RECEIPTS + 1).fill({}), checkpoints: [] },
        `audit-too-large: receipts ${AUDIT_MAX_RECEIPTS + 1} > ${AUDIT_MAX_RECEIPTS}; split the window`,
      ],
      [
        "checkpoints",
        { receipts: [], checkpoints: new Array(AUDIT_MAX_CHECKPOINTS + 1).fill({}) },
        `audit-too-large: checkpoints ${AUDIT_MAX_CHECKPOINTS + 1} > ${AUDIT_MAX_CHECKPOINTS}; split the window`,
      ],
      [
        "settlements",
        { receipts: [], checkpoints: [], settlements: new Array(AUDIT_MAX_SETTLEMENTS + 1).fill({}) },
        `audit-too-large: settlements ${AUDIT_MAX_SETTLEMENTS + 1} > ${AUDIT_MAX_SETTLEMENTS}; split the window`,
      ],
      [
        "inclusions",
        {
          receipts: [],
          checkpoints: [],
          inclusionReceipts: new Array(AUDIT_MAX_INCLUSIONS + 1).fill({}),
        },
        `audit-too-large: inclusions ${AUDIT_MAX_INCLUSIONS + 1} > ${AUDIT_MAX_INCLUSIONS}; split the window`,
      ],
    ];
    for (const [, input, message] of cases) {
      assert.throws(
        () => audit(input as never),
        (err: unknown) =>
          err instanceof Error &&
          (err as Error & { code?: string }).code === "audit-too-large" &&
          err.message === message,
      );
    }
    assert.throws(
      () =>
        auditWindows({
          windows: [
            {
              receipts: new Array(AUDIT_MAX_RECEIPTS + 1).fill({}),
              checkpoints: [],
              extract: {
                body: {
                  accountId: "a",
                  railId: "r",
                  windowStartMs: 1,
                  windowEndMs: 2,
                  settlements: [],
                },
                signature: "x",
                publicKeyPem: "y",
              },
            },
          ],
        } as never),
      (err: unknown) =>
        err instanceof Error &&
        (err as Error & { code?: string }).code === "audit-too-large" &&
        err.message ===
          `audit-too-large: receipts ${AUDIT_MAX_RECEIPTS + 1} > ${AUDIT_MAX_RECEIPTS}; split the window`,
    );
  });

  it("evidence forging audit-too-large stays inside the net", () => {
    const forgedCode: Record<string, unknown> = { receipts: [], checkpoints: [] };
    Object.defineProperty(forgedCode, "extract", {
      enumerable: true,
      get() {
        throw Object.assign(new Error("audit-too-large: receipts 9999 > 4096; split the window"), {
          code: "audit-too-large",
        });
      },
    });
    assertFixedSafety(audit(forgedCode as never));
  });

  it("stamp scope: a prior ceiling error object thrown by evidence becomes the fixed report", () => {
    let stamped: Error | undefined;
    try {
      audit({ receipts: new Array(AUDIT_MAX_RECEIPTS + 1).fill({}), checkpoints: [] } as never);
    } catch (err) {
      stamped = err as Error;
    }
    assert.ok(stamped);
    assert.equal((stamped as Error & { code?: string }).code, "audit-too-large");
    const reuse: Record<string, unknown> = { receipts: [], checkpoints: [] };
    Object.defineProperty(reuse, "extract", {
      enumerable: true,
      get() {
        throw stamped;
      },
    });
    assertFixedSafety(audit(reuse as never));
  });

  it("nested malformed evidence from a profile callback stays inside the net", () => {
    let nestedSawFixed = false;
    const profile = {
      ...SPEND_PROFILE,
      counterpartyUnbound() {
        const nested = audit({ receipts: [null], checkpoints: [] } as never);
        nestedSawFixed = nested.findings[0]?.code === "presented-object-malformed";
        return null;
      },
    } as ReconciliationProfile<never, never>;
    const outer = audit({
      receipts: [],
      checkpoints: [],
      extract: {
        body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
        signature: "x",
        publicKeyPem: "y",
      },
      profile,
    } as never);
    assert.equal(nestedSawFixed, true);
    assert.equal(outer.findings.some((f) => f.code === "presented-object-malformed"), false);
    assert.throws(
      () => audit({ receipts: new Array(AUDIT_MAX_RECEIPTS + 1).fill({}), checkpoints: [] } as never),
      (err: unknown) =>
        err instanceof Error && (err as Error & { code?: string }).code === "audit-too-large",
    );
  });

  it("nested real ceiling from a profile callback escapes as audit-too-large", () => {
    const message = `audit-too-large: receipts ${AUDIT_MAX_RECEIPTS + 1} > ${AUDIT_MAX_RECEIPTS}; split the window`;
    const profile = {
      ...SPEND_PROFILE,
      counterpartyUnbound() {
        audit({ receipts: new Array(AUDIT_MAX_RECEIPTS + 1).fill({}), checkpoints: [] } as never);
        return null;
      },
    } as ReconciliationProfile<never, never>;
    assert.throws(
      () =>
        audit({
          receipts: [],
          checkpoints: [],
          extract: {
            body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
            signature: "x",
            publicKeyPem: "y",
          },
          profile,
        } as never),
      (err: unknown) =>
        err instanceof Error &&
        (err as Error & { code?: string }).code === "audit-too-large" &&
        err.message === message,
    );
  });

  it("after an outer call exits with audit-too-large, a later call works", () => {
    const profile = {
      ...SPEND_PROFILE,
      counterpartyUnbound() {
        audit({ receipts: new Array(AUDIT_MAX_RECEIPTS + 1).fill({}), checkpoints: [] } as never);
        return null;
      },
    } as ReconciliationProfile<never, never>;
    assert.throws(
      () =>
        audit({
          receipts: [],
          checkpoints: [],
          extract: {
            body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
            signature: "x",
            publicKeyPem: "y",
          },
          profile,
        } as never),
      (err: unknown) =>
        err instanceof Error && (err as Error & { code?: string }).code === "audit-too-large",
    );
    assertFixedSafety(audit({ receipts: [null], checkpoints: [] } as never));
  });

  it("matches master reports for wrong-typed inputs that already returned a report", () => {
    const inputs: Record<string, unknown> = {
      "policyHash-0": {
        receipts: [{ claims: { policyHash: 0, nonce: "n", manifestHash: null, prevReceiptHash: null }, coseHex: "" }],
        checkpoints: [],
      },
      "encoding-0": {
        receipts: [
          {
            claims: { policyHash: H, nonce: "n", manifestHash: null, prevReceiptHash: null, encoding: 0 },
            coseHex: "",
          },
        ],
        checkpoints: [],
      },
      "encoding-json-coseHex-null": {
        receipts: [
          {
            claims: {
              policyHash: H,
              nonce: "n",
              manifestHash: null,
              prevReceiptHash: null,
              encoding: "json",
            },
            coseHex: null,
          },
        ],
        checkpoints: [],
      },
      "extract-accountId-0": {
        receipts: [],
        checkpoints: [],
        extract: {
          body: { accountId: 0, railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
          signature: "",
          publicKeyPem: "",
        },
      },
      "extract-windowStartMs-bad": {
        receipts: [],
        checkpoints: [],
        extract: {
          body: { accountId: "a", railId: "r", windowStartMs: 1.5, windowEndMs: 2, settlements: [] },
          signature: "",
          publicKeyPem: "",
        },
      },
      "checkpoint-epoch-1.5": {
        receipts: [],
        checkpoints: [
          {
            claims: {
              epoch: 1.5,
              startMs: 0,
              endMs: 1,
              receiptCount: 0,
              chainHeadHash: null,
              prevCheckpointHash: null,
              totals: null,
            },
            coseHex: "",
          },
        ],
      },
      "extract-null": { receipts: [], checkpoints: [], extract: null },
      "manifest-null": { receipts: [], checkpoints: [], manifest: null },
      "anchor-null": { receipts: [], checkpoints: [], anchorCheckpoint: null },
      "nextExtract-body-null": {
        receipts: [],
        checkpoints: [],
        nextExtract: { body: null, signature: "", publicKeyPem: "" },
      },
      "inclusion-siblings-not-array": {
        receipts: [],
        checkpoints: [],
        inclusionReceipts: [{ checkpointHash: H, leafIndex: 0, inclusionProof: { siblings: 0 } }],
      },
      "settlements-null-with-extract": {
        receipts: [],
        checkpoints: [],
        extract: {
          body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
          signature: "x",
          publicKeyPem: "y",
        },
        settlements: [null],
      },
      "settlements-null": { receipts: [], checkpoints: [], settlements: null },
      "inclusionReceipts-null": { receipts: [], checkpoints: [], inclusionReceipts: null },
      "coseHex-obj": { receipts: [{ claims: {}, coseHex: {} }], checkpoints: [] },
    };
    for (const [name, input] of Object.entries(inputs)) {
      assert.deepEqual(snap(audit(input as never)), MASTER_EQUIV[name], name);
    }

    const extract = {
      body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
      signature: "x",
      publicKeyPem: "y",
    };
    const settlements0 = audit({
      receipts: [],
      checkpoints: [],
      extract: extract as never,
      settlements: 0 as never,
    });
    assert.equal(settlements0.findings.some((f) => f.code === "presented-object-malformed"), false);

    const settlementsLen = audit({
      receipts: [],
      checkpoints: [],
      extract: extract as never,
      settlements: { length: 4097 } as never,
    });
    assert.equal(settlementsLen.ok, false);
    assert.equal(settlementsLen.findings.some((f) => f.code === "presented-object-malformed"), false);
    assert.equal(settlementsLen.findings[0]?.code, "extract-settlement-mismatch");

    const emptyWindows = auditWindows({ windows: [], issuerTrust: {} } as never);
    assert.equal(emptyWindows.ok, false);
    assert.deepEqual(emptyWindows.findings.map((f) => f.code), ["extract-scope-mismatch"]);

    for (const bad of [{}, 0, 5] as const) {
      const report = audit({ receipts: [], checkpoints: [], inclusionReceipts: bad as never });
      assert.equal(report.findings.some((f) => f.code === "presented-object-malformed"), false);
    }

    const idleTrust = audit({
      receipts: [],
      checkpoints: [],
      trust: { publicKeyPem: 0 } as never,
    });
    assert.equal(idleTrust.findings.some((f) => f.code === "presented-object-malformed"), false);
    const idleManifest = audit({
      receipts: [],
      checkpoints: [],
      manifestTrust: {} as never,
    });
    assert.equal(idleManifest.findings.some((f) => f.code === "presented-object-malformed"), false);
  });

  it("extract body settlements not an array is caught by the safety net", () => {
    assertFixedSafety(
      audit({
        receipts: [],
        checkpoints: [],
        extract: {
          body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: {} },
          signature: "",
          publicKeyPem: "",
        },
      } as never),
    );
  });

  it("auditWindows fails the whole run with the fixed report when one window is unreadable", () => {
    const report = auditWindows({
      windows: [
        {
          receipts: [null],
          checkpoints: [],
          extract: {
            body: {
              accountId: "a",
              railId: "r",
              windowStartMs: 1,
              windowEndMs: 2,
              settlements: [],
            },
            signature: "x",
            publicKeyPem: "y",
          },
        },
        {
          receipts: [],
          checkpoints: [],
          extract: {
            body: {
              accountId: "a",
              railId: "r",
              windowStartMs: 2,
              windowEndMs: 3,
              settlements: [],
            },
            signature: "x",
            publicKeyPem: "y",
          },
        },
      ],
    } as never);
    assert.equal(report.ok, false);
    assert.equal(report.windows.length, 0);
    assert.equal(report.resolved, 0);
    assert.deepEqual(report.findings, FIXED_SAFETY_REPORT.findings);
    assert.equal(report.guarantee, FIXED_SAFETY_REPORT.guarantee);
    assert.equal(report.summary, FIXED_SAFETY_REPORT.summary);
  });

  it("seeded property: random type noise does not throw except real ceiling cases", () => {
    let state = 0xc0ffee >>> 0;
    const rand = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const noise = (): unknown => {
      const pick = Math.floor(rand() * 7);
      if (pick === 0) return null;
      if (pick === 1) return Math.floor(rand() * 10);
      if (pick === 2) return `s${Math.floor(rand() * 10)}`;
      if (pick === 3) return [];
      if (pick === 4) return {};
      if (pick === 5) return Symbol("n");
      return 1n;
    };
    const extract = {
      body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
      signature: "x",
      publicKeyPem: "y",
    };
    const keys = [
      "receipts",
      "checkpoints",
      "settlements",
      "inclusionReceipts",
      "extract",
      "manifest",
      "anchorCheckpoint",
      "nextExtract",
      "previousExtract",
      "trust",
      "issuerTrust",
      "witnessTrust",
      "manifestTrust",
      "payeeTrust",
      "layer2",
    ] as const;
    for (let i = 0; i < 2500; i += 1) {
      const input: Record<string, unknown> = { receipts: [], checkpoints: [] };
      const key = keys[Math.floor(rand() * keys.length)]!;
      let expectCeiling = false;
      if (key === "receipts" || key === "checkpoints") {
        if (rand() < 0.05) {
          const max = key === "receipts" ? AUDIT_MAX_RECEIPTS : AUDIT_MAX_CHECKPOINTS;
          input[key] = { length: max + 1 };
          expectCeiling = true;
        } else {
          const item: Record<string, unknown> = {};
          const field = rand() < 0.5 ? "claims" : "coseHex";
          if (field === "claims") {
            item.claims = { [String(Math.floor(rand() * 4))]: noise() };
            item.coseHex = "";
          } else {
            item.claims = {};
            item.coseHex = noise();
          }
          input[key] = [item];
        }
      } else if (key === "extract" || key === "nextExtract" || key === "previousExtract") {
        input[key] = {
          body: noise(),
          signature: noise(),
          publicKeyPem: noise(),
        };
      } else if (key === "trust" || key === "issuerTrust" || key === "witnessTrust" || key === "manifestTrust") {
        if (rand() < 0.5) {
          input[key] = { publicKeyPem: 0 };
          if (key === "trust") input.extract = extract;
          if (key === "manifestTrust") {
            input.manifest = {
              body: {
                acceptanceCriteriaHash: H,
                amount: "1",
                currency: "TRY",
                payee: null,
                expiresAtMs: null,
                ap2MandateHash: null,
              },
              coseHex: "",
              publicKeyPem: "",
            };
          }
          if (key === "witnessTrust" && rand() < 0.5) {
            input.inclusionReceipts = [{ coseHex: "aa", index: 0 }];
          }
        } else {
          input[key] = { publicKeyPem: "not-a-real-pem" };
        }
      } else if (key === "settlements") {
        if (rand() < 0.05) {
          input[key] = { length: AUDIT_MAX_SETTLEMENTS + 1 };
          expectCeiling = true;
        } else {
          input[key] = noise();
        }
      } else if (key === "inclusionReceipts") {
        if (rand() < 0.05) {
          input[key] = { length: AUDIT_MAX_INCLUSIONS + 1 };
          expectCeiling = true;
        } else {
          input[key] = noise();
        }
      } else {
        input[key] = noise();
      }
      let threw: unknown = null;
      try {
        audit(input as never);
      } catch (err) {
        threw = err;
      }
      if (expectCeiling) {
        assert.ok(
          threw instanceof Error &&
            (threw as Error & { code?: string }).code === "audit-too-large",
          `expected ceiling at i=${i} key=${key}`,
        );
      } else {
        assert.equal(threw, null, `unexpected throw at i=${i} key=${key}: ${String((threw as Error)?.message ?? threw)}`);
      }
    }
  });

  it("silent-empty master cells keep the master report without inventing a nest finding", () => {
    const extract = {
      body: { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
      signature: "x",
      publicKeyPem: "y",
    };
    const silentCells: Array<[string, unknown]> = [
      ["inclusionReceipts", 0],
      ["inclusionReceipts", ""],
      ["inclusionReceipts", true],
      ["inclusionReceipts", {}],
      ["inclusionReceipts", { length: 0 }],
      ["settlements", 0],
      ["settlements", ""],
    ];
    for (const [nest, bad] of silentCells) {
      const balanced: Record<string, unknown> = { receipts: [], checkpoints: [], [nest]: bad };
      if (nest === "settlements") balanced.extract = extract;
      const balancedReport = audit(balanced as never);
      assert.equal(
        balancedReport.findings.some((f) => f.code === "presented-object-malformed"),
        false,
        `balanced ${nest}=${JSON.stringify(bad)}`,
      );
    }
  });
});

