import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateManifestKeys, manifestHash, signManifest } from "@cedulon/manifest";
import { generateReceiptKeys, signReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 1_000;

// documents current behaviour; semantics decision tracked for -05

describe("Tiago -04 repro probes (current behaviour)", () => {
  it("break 5: rail row in-window, issuer receipt out-of-window → settlement-without-receipt", () => {
    // documents current behaviour; semantics decision tracked for -05
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
      true,
    );
  });

  it("break 5 reverse: receipt in-window, rail row outside the declared window → extract-scope-mismatch, still matched", () => {
    // documents current behaviour; semantics decision tracked for -05
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
        settlements: [{ ref: "ref-edge", amount: "1", currency: "USD", timestampMs: WINDOW_END }],
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
    assert.equal(
      report.findings.some((f) => f.code === "extract-scope-mismatch" && f.id === "ref-edge"),
      true,
    );
    assert.equal(
      report.findings.some((f) => f.code === "settlement-without-receipt"),
      false,
      "the out-of-window row is still reconciled by ref",
    );
  });

  it("break 7: receipt names A's 100 USD manifest and pays B; extract matches ref/amount/currency → all comparisons pass", () => {
    // documents current behaviour; semantics decision tracked for -05
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
    assert.equal(report.findings.some((f) => f.code === "manifest-terms-mismatch"), false);
    assert.equal(report.findings.some((f) => f.code === "settlement-without-receipt"), false);
    assert.equal(report.findings.some((f) => f.code === "settlement-mismatch"), false);
    assert.equal(report.ok, true);
  });
});
