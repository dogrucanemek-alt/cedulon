import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { DEFAULT_CLOCK_SKEW_MS, audit } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateManifestKeys, manifestHash, signManifest, verifyManifest } from "@cedulon/manifest";
import { counterSign, generateReceiptKeys, receiptHash, signReceipt, signReceiptUnchecked } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 1_000;

// K5 / K7 — Tiago 561 + CEDULON_05_TAMIR_KARARLARI K5/K7

describe("Tiago -04 K5/K7 (decided)", () => {
  it("break 5: rail row in-window, issuer receipt out-of-window → reconciled by ref", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = signReceipt(
      {
        payer: "payer",
        payee: "payee-1",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-edge",
        timestampMs: WINDOW_END,
        nonce: "n-edge".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "ref-edge", amount: "1", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const report = audit({
      receipts: [receipt],
      checkpoints: [],
      extract,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(
      report.findings.some((f) => f.code === "settlement-without-receipt" && f.id === "ref-edge"),
      false,
    );
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
  });

  it("break 5 reverse: honest in-window pair is not charged in either direction", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = signReceipt(
      {
        payer: "payer",
        payee: "payee-1",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-edge",
        timestampMs: NOW,
        nonce: "n-in".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "ref-edge", amount: "1", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const report = audit({
      receipts: [receipt],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      extract,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.findings.some((f) => f.code === "settlement-without-receipt"), false);
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
    assert.equal(report.findings.some((f) => f.code === "extract-scope-mismatch"), false);
  });

  it("K5: unmatched settled receipt inside closing δ is boundary-deferred, not a charge", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const late = WINDOW_END - 1;
    const receipt = signReceipt(
      {
        payer: "payer",
        payee: "payee-1",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-late",
        timestampMs: late,
        nonce: "n-late".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "other", amount: "1", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const report = audit({
      receipts: [receipt],
      checkpoints: [],
      extract,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.findings.some((f) => f.code === "receipt-without-settlement"), false);
    assert.equal(
      report.warnings.some((w) => w.code === "boundary-deferred" && w.id === receipt.claims.nonce),
      true,
    );
    assert.equal(report.guarantee, "conditional");
  });

  it("K5: clockSkewMs overrides the profile default", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const mid = NOW + 10_000;
    const receipt = signReceipt(
      {
        payer: "payer",
        payee: "payee-1",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-mid",
        timestampMs: mid,
        nonce: "n-mid".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END + 60_000,
        clockSkewMs: 1_000,
        settlements: [{ ref: "other", amount: "1", currency: "USD", timestampMs: NOW + 30_000 }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    assert.ok(DEFAULT_CLOCK_SKEW_MS > 1_000);
    const report = audit({
      receipts: [receipt],
      checkpoints: [],
      extract,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END + 60_000,
      },
    });
    assert.equal(
      report.findings.some((f) => f.code === "receipt-without-settlement"),
      true,
      "outside the declared 1s δ this is a real shortfall",
    );
    assert.equal(report.warnings.some((w) => w.code === "boundary-deferred"), false);
  });

  it("K5: consecutive nextExtract closes a deferred receipt; a miss becomes a charge", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const late = WINDOW_END - 1;
    const receipt = signReceipt(
      {
        payer: "payer",
        payee: "payee-1",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-late",
        timestampMs: late,
        nonce: "n-late".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "other", amount: "1", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const nextHit = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: WINDOW_END,
        windowEndMs: WINDOW_END + 1_000,
        settlements: [{ ref: "ref-late", amount: "1", currency: "USD", timestampMs: WINDOW_END }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const nextMiss = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: WINDOW_END,
        windowEndMs: WINDOW_END + 1_000,
        settlements: [{ ref: "someone-else", amount: "1", currency: "USD", timestampMs: WINDOW_END }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const trust = {
      publicKeyPem: rail.publicKeyPem,
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
    };
    const closed = audit({
      receipts: [receipt],
      checkpoints: [],
      extract,
      nextExtract: nextHit,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust,
    });
    assert.equal(closed.findings.some((f) => f.code === "receipt-without-settlement"), false);
    assert.equal(closed.warnings.some((w) => w.code === "boundary-deferred" && w.id === receipt.claims.nonce), false);
    const open = audit({
      receipts: [receipt],
      checkpoints: [],
      extract,
      nextExtract: nextMiss,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust,
    });
    assert.equal(
      open.findings.some((f) => f.code === "receipt-without-settlement" && f.id === receipt.claims.nonce),
      true,
    );
  });

  it("break 7: manifest payee=A and a receipt that pays B is a named charge", () => {
    const honest = generateReceiptKeys();
    const merchant = generateManifestKeys();
    const rail = generateExtractKeys();
    const manifest = signManifest(
      {
        description: "payee-A terms",
        amount: "100",
        currency: "USD",
        acceptanceCriteriaHash: TEST_HASH,
        cancelCondition: "none",
        expiresAtMs: NOW + 60_000,
        payee: "payee-A",
      },
      merchant.privateKeyPem,
      merchant.publicKeyPem,
    );
    const receipt = signReceipt(
      {
        payer: "payer",
        payee: "payee-B",
        amount: "100",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: manifestHash(manifest),
        noManifest: false,
        x402PaymentRef: "ref-b",
        timestampMs: NOW,
        nonce: "n-b".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const extract = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "ref-b", amount: "100", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const report = audit({
      receipts: [receipt],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      extract,
      manifest,
      manifestTrust: { publicKeyPem: merchant.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(
      report.findings.some((f) => f.code === "manifest-terms-mismatch" && f.detail.includes("payee-B")),
      true,
    );
  });

  it("K7: beneficiary mismatch is named; both bindings absent is counterparty-unbound and ok is unchanged", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = signReceipt(
      {
        payer: "payer",
        payee: "payee-1",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-b",
        timestampMs: NOW,
        nonce: "n-b".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const mismatched = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [
          { ref: "ref-b", amount: "1", currency: "USD", timestampMs: NOW, beneficiary: "someone-else" },
        ],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const unbound = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "ref-b", amount: "1", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const trust = {
      publicKeyPem: rail.publicKeyPem,
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
    };
    const pins = {
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust,
    };
    const named = audit({
      receipts: [receipt],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      extract: mismatched,
      ...pins,
    });
    assert.equal(named.findings.some((f) => f.code === "beneficiary-mismatch"), true);
    const scope = audit({
      receipts: [receipt],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      extract: unbound,
      ...pins,
    });
    assert.equal(scope.warnings.some((w) => w.code === "counterparty-unbound"), true);
    assert.equal(scope.ok, true);
  });

  it("K7: a payee-less signed manifest still verifies (optional member is backward compatible)", () => {
    const merchant = generateManifestKeys();
    const signed = signManifest(
      {
        description: "open offer",
        amount: "100",
        currency: "USD",
        acceptanceCriteriaHash: TEST_HASH,
        cancelCondition: "none",
        expiresAtMs: NOW + 60_000,
      },
      merchant.privateKeyPem,
      merchant.publicKeyPem,
    );
    assert.equal(verifyManifest(signed, merchant.publicKeyPem), true);
    assert.equal(signed.body.payee, undefined);
  });
});

describe("reconciliation gaps: following extract, per-receipt approval, totals order, unparseable amount", () => {
  const claimsFor = (ref: string, nonce: string, ts: number, prev: string | null, currency = "USD", amount = "1") => ({
    payer: "payer",
    payee: "payee-1",
    amount,
    currency,
    policyHash: TEST_HASH,
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: ref,
    timestampMs: ts,
    nonce: nonce.padEnd(16, "-"),
    prevReceiptHash: prev,
    outcome: "settled" as const,
  });
  const extractFor = (
    rail: ReturnType<typeof generateExtractKeys>,
    accountId: string,
    start: number,
    end: number,
    rows: Array<{ ref: string; amount?: string; currency?: string }>,
  ) =>
    signRailExtract(
      {
        accountId,
        railId: "rail",
        windowStartMs: start,
        windowEndMs: end,
        settlements: rows.map((r) => ({ ref: r.ref, amount: r.amount ?? "1", currency: r.currency ?? "USD", timestampMs: start + 1 })),
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
  const railPin = (rail: ReturnType<typeof generateExtractKeys>) => ({
    publicKeyPem: rail.publicKeyPem,
    accountId: "acct",
    railId: "rail",
    windowStartMs: NOW,
    windowEndMs: WINDOW_END,
  });

  // Step 5 resolves a closing-edge deferral with "the following window's
  // extract". An extract the rail key signed for another account, or for a
  // window that does not start where this one ends, is not that document: it
  // resolves nothing and fails closed on the same terms as a primary extract
  // outside the stated scope (MUST-T10-11).
  for (const [label, accountId, start] of [
    ["another account", "acct-B", WINDOW_END],
    ["a window that does not follow", "acct", WINDOW_END + 50_000],
  ] as const) {
    it(`RED then GREEN: an extract for ${label} does not resolve a deferred receipt (MUST-T10-17)`, () => {
      const honest = generateReceiptKeys();
      const rail = generateExtractKeys();
      const receipt = signReceipt(claimsFor("ref-late", "n-late", WINDOW_END - 1, null), honest.privateKeyPem, honest.publicKeyPem);
      const report = audit({
        receipts: [receipt],
        checkpoints: [
          signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem),
        ],
        extract: extractFor(rail, "acct", NOW, WINDOW_END, [{ ref: "other" }]),
        nextExtract: extractFor(rail, accountId, start, start + 1_000, [{ ref: "ref-late" }]),
        issuerTrust: { publicKeyPem: honest.publicKeyPem },
        trust: railPin(rail),
      });
      assert.equal(
        report.warnings.some((w) => w.code === "boundary-deferred" && w.id === receipt.claims.nonce),
        true,
        "the deferral must stay open",
      );
      assert.equal(report.findings.some((f) => f.code === "extract-scope-mismatch" && f.id === "nextExtract"), true);
      assert.equal(report.ok, false);
      assert.equal(report.guarantee, "conditional");
    });
  }

  it("RED then GREEN: payee approval belongs to the receipt it was given for, not to its nonce (MUST-T4-14)", () => {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const rail = generateExtractKeys();
    const a = signReceipt(claimsFor("ref-a", "n-same", NOW + 10, null), honest.privateKeyPem, honest.publicKeyPem);
    const b = signReceipt(claimsFor("ref-b", "n-same", NOW + 11, receiptHash(a)), honest.privateKeyPem, honest.publicKeyPem);
    const report = audit({
      receipts: [counterSign(a, payee.privateKeyPem, payee.publicKeyPem, honest.publicKeyPem), b],
      checkpoints: [
        signCheckpoint(buildCheckpointClaims(1, [a, b], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem),
      ],
      extract: extractFor(rail, "acct", NOW, WINDOW_END, [{ ref: "ref-a" }, { ref: "ref-b" }]),
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
    });
    assert.equal(report.warnings.filter((w) => w.code === "countersign-missing").length, 1);
    assert.equal(report.guarantee, "conditional");
  });

  it("RED then GREEN: checkpoint totals compare by currency, not by the order the members arrived in", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const a = signReceipt(claimsFor("ref-a", "n-eur", NOW + 10, null, "EUR"), honest.privateKeyPem, honest.publicKeyPem);
    const b = signReceipt(claimsFor("ref-b", "n-usd", NOW + 11, receiptHash(a), "USD"), honest.privateKeyPem, honest.publicKeyPem);
    const cp = signCheckpoint(buildCheckpointClaims(1, [a, b], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem);
    const base = {
      receipts: [a, b],
      extract: extractFor(rail, "acct", NOW, WINDOW_END, [
        { ref: "ref-a", currency: "EUR" },
        { ref: "ref-b", currency: "USD" },
      ]),
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    };
    const totals = cp.claims.totals as Record<string, string>;
    const reordered = { ...cp, claims: { ...cp.claims, totals: { USD: totals.USD, EUR: totals.EUR } } };
    const report = audit({ ...base, checkpoints: [reordered] });
    assert.equal(report.findings.some((f) => f.code === "checkpoint-total-mismatch"), false);
    assert.equal(report.ok, true);
    // A real difference is still a difference. It has to be signed: totals
    // changed after signing are a checkpoint that does not verify, which is
    // a different finding.
    const wrong = signCheckpoint(
      { ...buildCheckpointClaims(1, [a, b], NOW, WINDOW_END, null), totals: { EUR: "2", USD: totals.USD } },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    assert.equal(audit({ ...base, checkpoints: [wrong] }).findings.some((f) => f.code === "checkpoint-total-mismatch"), true);
  });

  it("RED then GREEN: an amount the audit cannot parse is malformed-amount, and the report still comes back (MUST-T10-13)", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const bad = signReceiptUnchecked(claimsFor("ref-x", "n-bad", NOW + 10, null, "USD", "1.5"), honest.privateKeyPem, honest.publicKeyPem);
    const claims = buildCheckpointClaims(1, [bad], NOW, WINDOW_END, null, () => ({}));
    const cp = signCheckpoint({ ...claims, totals: null }, honest.privateKeyPem, honest.publicKeyPem);
    let report: ReturnType<typeof audit> | undefined;
    assert.doesNotThrow(() => {
      report = audit({
        receipts: [bad],
        checkpoints: [cp],
        extract: extractFor(rail, "acct", NOW, WINDOW_END, [{ ref: "ref-x", amount: "2" }]),
        trust: railPin(rail),
        issuerTrust: { publicKeyPem: honest.publicKeyPem },
      });
    });
    assert.equal(report!.ok, false);
    assert.equal(report!.findings.some((f) => f.code === "malformed-amount"), true);
  });

  // MUST-T10-10 asks this of the presented extract's rows. A row the following
  // extract carries outside its own window says nothing about that window, so
  // it cannot close a deferral either.
  it("RED then GREEN: a following-extract row outside that extract's own window does not resolve a deferred receipt (MUST-T10-10)", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = signReceipt(claimsFor("ref-late", "n-late", WINDOW_END - 1, null), honest.privateKeyPem, honest.publicKeyPem);
    const next = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: WINDOW_END,
        windowEndMs: WINDOW_END + 1_000,
        settlements: [{ ref: "ref-late", amount: "1", currency: "USD", timestampMs: WINDOW_END + 50_000 }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const report = audit({
      receipts: [receipt],
      checkpoints: [
        signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem),
      ],
      extract: extractFor(rail, "acct", NOW, WINDOW_END, [{ ref: "other" }]),
      nextExtract: next,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      trust: railPin(rail),
    });
    assert.equal(
      report.warnings.some((w) => w.code === "boundary-deferred" && w.id === receipt.claims.nonce),
      true,
      "the deferral must stay open",
    );
    assert.equal(report.findings.some((f) => f.code === "extract-scope-mismatch" && f.id === "ref-late"), true);
    assert.equal(report.ok, false);
  });

  // A currency is a string the issuer chose. Written into a plain object with
  // ordinary assignment, "__proto__" sets the prototype instead of a member,
  // and that currency's money disappears from the totals on both sides.
  it("RED then GREEN: a currency spelled like an object property still counts in checkpoint totals", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const r = signReceipt(claimsFor("ref-p", "n-p", NOW + 10, null, "__proto__", "7"), honest.privateKeyPem, honest.publicKeyPem);
    const totals = buildCheckpointClaims(1, [r], NOW, WINDOW_END, null).totals as Record<string, string>;
    assert.deepEqual(Object.keys(totals), ["__proto__"]);
    assert.equal(totals["__proto__"], "7");
    const signedEmpty = signCheckpoint(
      { ...buildCheckpointClaims(1, [r], NOW, WINDOW_END, null), totals: {} },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const report = audit({
      receipts: [r],
      checkpoints: [signedEmpty],
      extract: extractFor(rail, "acct", NOW, WINDOW_END, [{ ref: "ref-p", amount: "7", currency: "__proto__" }]),
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.equal(report.findings.some((f) => f.code === "checkpoint-total-mismatch"), true);
  });
});
