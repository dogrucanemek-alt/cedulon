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

function manifest() {
  const keys = generateManifestKeys();
  const signed = signManifest(
    {
      description: "terms-probe",
      amount: "1",
      currency: "USD",
      acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      cancelCondition: "none",
      expiresAtMs: NOW + 60_000,
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
  return { keys, signed };
}

function receipt(
  keys: { privateKeyPem: string; publicKeyPem: string },
  boundTo: string,
  amount: string,
) {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee",
      amount,
      currency: "USD",
      policyHash: TEST_HASH,
      manifestHash: boundTo,
      noManifest: false,
      x402PaymentRef: "ref-fake",
      timestampMs: NOW,
      nonce: "n-terms".padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

/**
 * A terms mismatch is a charge, not a name. The same split as
 * receiptRef clashes: pin usable → attested, as a finding; pin
 * absent or unreadable → presented list, as a warning.
 */
describe("manifest-terms-mismatch and an unverified receipt", () => {
  it("with an issuer pin, a foreign receipt that names the hash and lies about amount does not invent a terms finding", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const m = manifest();
    const fake = receipt(attacker, manifestHash(m.signed), "99");

    const report = audit({
      receipts: [fake],
      checkpoints: [],
      manifest: m.signed,
      manifestTrust: { publicKeyPem: m.keys.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });

    const terms = report.findings.find((f) => f.code === "manifest-terms-mismatch");
    const mismatch = report.findings.find((f) => f.code === "issuer-key-mismatch");
    assert.equal(
      terms,
      undefined,
      `invented terms finding must not appear; findings=${report.findings.map((f) => f.code).join(",") || "none"}`,
    );
    assert.ok(mismatch, "issuer-key-mismatch still names the foreign key");
    assert.equal(report.ok, false, "the audit still fails on the foreign key");
  });

  it("without an issuer pin, the same foreign receipt is a terms warning, not a finding", () => {
    const attacker = generateReceiptKeys();
    const m = manifest();
    const fake = receipt(attacker, manifestHash(m.signed), "99");

    const report = audit({
      receipts: [fake],
      checkpoints: [],
      manifest: m.signed,
      manifestTrust: { publicKeyPem: m.keys.publicKeyPem },
    });

    const termsFinding = report.findings.find((f) => f.code === "manifest-terms-mismatch");
    const termsWarning = report.warnings.find((w) => w.code === "manifest-terms-mismatch");
    const mismatch = report.findings.find((f) => f.code === "issuer-key-mismatch");
    assert.equal(
      termsFinding,
      undefined,
      `terms must not be a finding without a pin; findings=${report.findings.map((f) => f.code).join(",") || "none"}`,
    );
    assert.ok(
      termsWarning,
      `terms warning must be said out loud; warnings=${report.warnings.map((w) => w.code).join(",") || "none"}`,
    );
    assert.equal(termsWarning.severity, "warn");
    assert.ok(
      report.warnings.some((w) => w.code === "unauthenticated-issuer"),
      "unauthenticated-issuer stays beside the terms warning",
    );
    assert.equal(mismatch, undefined, "no pin means no issuer-key-mismatch");
    assert.equal(report.guarantee, "conditional");
  });

  it("with an issuer pin, a receipt that verifies and departs from the manifest is still a finding", () => {
    const honest = generateReceiptKeys();
    const m = manifest();
    const lying = receipt(honest, manifestHash(m.signed), "99");

    const report = audit({
      receipts: [lying],
      checkpoints: [],
      manifest: m.signed,
      manifestTrust: { publicKeyPem: m.keys.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });

    const terms = report.findings.find((f) => f.code === "manifest-terms-mismatch");
    assert.ok(
      terms,
      `a real departure under the pin must remain a finding; findings=${report.findings.map((f) => f.code).join(",") || "none"} warnings=${report.warnings.map((w) => w.code).join(",") || "none"}`,
    );
    assert.equal(report.ok, false, "a real terms violation still fails the audit");
  });
});
