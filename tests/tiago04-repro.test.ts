import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { DEFAULT_CLOCK_SKEW_MS, audit } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateManifestKeys, manifestHash, signManifest, verifyManifest } from "@cedulon/manifest";
import { generateReceiptKeys, signReceipt } from "@cedulon/receipts";
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
