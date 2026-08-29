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
      acceptanceCriteriaHash: "00",
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
      policyHash: "p",
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
 * Measurement, not a verdict. `manifest-terms-mismatch` walks
 * `input.receipts` before `attested`. The question is whether a
 * receipt that does not verify can invent a terms finding.
 */
describe("manifest-terms-mismatch and an unverified receipt", () => {
  it("with an issuer pin, a foreign receipt that names the hash and lies about amount is reported", () => {
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
    assert.ok(
      terms,
      `terms finding fired on a presented foreign receipt; got findings=${report.findings.map((f) => f.code).join(",") || "none"}`,
    );
    assert.ok(mismatch, "issuer-key-mismatch still names the foreign key");
    assert.equal(report.ok, false);
  });

  it("without an issuer pin, the same foreign receipt still invents the terms finding", () => {
    const attacker = generateReceiptKeys();
    const m = manifest();
    const fake = receipt(attacker, manifestHash(m.signed), "99");

    const report = audit({
      receipts: [fake],
      checkpoints: [],
      manifest: m.signed,
      manifestTrust: { publicKeyPem: m.keys.publicKeyPem },
    });

    const terms = report.findings.find((f) => f.code === "manifest-terms-mismatch");
    const mismatch = report.findings.find((f) => f.code === "issuer-key-mismatch");
    assert.ok(
      terms,
      `without a pin the terms finding still fires; findings=${report.findings.map((f) => f.code).join(",") || "none"} warnings=${report.warnings.map((w) => w.code).join(",") || "none"}`,
    );
    assert.equal(mismatch, undefined, "no pin means no issuer-key-mismatch");
    assert.equal(report.ok, false, "the invented finding fails the audit");
  });
});
