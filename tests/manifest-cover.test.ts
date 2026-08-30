import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import {
  generateManifestKeys,
  manifestHash,
  signManifest,
} from "@cedulon/manifest";
import { generateReceiptKeys, signReceipt } from "@cedulon/receipts";

const NOW = 1_700_000_000_000;

/**
 * Measurement, not a verdict. `manifest-covers-no-receipt` walks
 * `input.receipts` before `attested` exists. The question is whether a
 * receipt that does not verify can still silence that warning.
 */
describe("manifest-covers-no-receipt and an unverified receipt", () => {
  it("a receipt that fails the issuer pin still silences the cover warning", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const manifestKeys = generateManifestKeys();
    const manifest = signManifest(
      {
        description: "cover-probe",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        cancelCondition: "none",
        expiresAtMs: NOW + 60_000,
      },
      manifestKeys.privateKeyPem,
      manifestKeys.publicKeyPem,
    );
    const boundTo = manifestHash(manifest);
    const fake = signReceipt(
      {
        payer: "payer",
        payee: "payee",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: boundTo,
        noManifest: false,
        x402PaymentRef: "ref-fake",
        timestampMs: NOW,
        nonce: "n-fake".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );

    const report = audit({
      receipts: [fake],
      checkpoints: [],
      manifest,
      manifestTrust: { publicKeyPem: manifestKeys.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });

    const cover = report.warnings.find((w) => w.code === "manifest-covers-no-receipt");
    const mismatch = report.findings.find((f) => f.code === "issuer-key-mismatch");
    assert.equal(
      cover,
      undefined,
      `cover warning must be silent when any presented receipt names the hash; got ${report.warnings.map((w) => w.code).join(",") || "none"}`,
    );
    assert.ok(
      mismatch,
      `issuer-key-mismatch must still fire; findings=${report.findings.map((f) => f.code).join(",") || "none"}`,
    );
    assert.equal(report.ok, false, "the report stays dirty");
    assert.equal(report.guarantee, "conditional");
  });

  it("the other direction: no receipt naming the hash still warns", () => {
    const honest = generateReceiptKeys();
    const manifestKeys = generateManifestKeys();
    const manifest = signManifest(
      {
        description: "cover-probe",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        cancelCondition: "none",
        expiresAtMs: NOW + 60_000,
      },
      manifestKeys.privateKeyPem,
      manifestKeys.publicKeyPem,
    );
    const unbound = signReceipt(
      {
        payer: "payer",
        payee: "payee",
        amount: "1",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-none",
        timestampMs: NOW,
        nonce: "n-none".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      honest.privateKeyPem,
      honest.publicKeyPem,
    );

    const report = audit({
      receipts: [unbound],
      checkpoints: [],
      manifest,
      manifestTrust: { publicKeyPem: manifestKeys.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });

    assert.ok(
      report.warnings.some((w) => w.code === "manifest-covers-no-receipt"),
      `expected cover warning, got ${report.warnings.map((w) => w.code).join(",") || "none"}`,
    );
  });
});
