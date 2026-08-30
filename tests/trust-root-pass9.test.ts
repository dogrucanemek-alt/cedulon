import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type AuditInput } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import {
  generateManifestKeys,
  manifestHash,
  signManifest,
  type SignedManifest,
} from "@cedulon/manifest";
import { generateReceiptKeys, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, type SignedRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(keys: Keys, ref: string, i: number, boundTo: string | null = null): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee",
      amount: "1",
      currency: "USD",
      policyHash: "policy-hash",
      manifestHash: boundTo,
      noManifest: boundTo === null,
      x402PaymentRef: ref,
      timestampMs: NOW + i,
      nonce: `n${i}`.padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function railWith(rail: Keys, ref = "ref-ok"): SignedRailExtract {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
      settlements: [{ ref, amount: "1", currency: "USD", timestampMs: NOW }],
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function balancedWith(honest: Keys, rail: Keys, receipt: SignedReceipt): AuditInput {
  return {
    receipts: [receipt],
    checkpoints: [signCheckpoint(
      buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    )],
    extract: railWith(rail),
    trust: {
      publicKeyPem: rail.publicKeyPem,
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
    },
    issuerTrust: { publicKeyPem: honest.publicKeyPem },
  };
}

function manifestBody() {
  return {
    description: "one unit of work",
    amount: "1",
    currency: "USD",
    acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    cancelCondition: "none",
    expiresAtMs: NOW + 60_000,
  };
}

function honestManifest(): { keys: Keys; signed: SignedManifest } {
  const keys = generateManifestKeys();
  return { keys, signed: signManifest(manifestBody(), keys.privateKeyPem, keys.publicKeyPem) };
}

describe("what the manifest root does not cover", () => {
  it("93 RED: an attributed manifest that covers no receipt still reports unconditional", () => {
    // The fifth root asks who signed the manifest. It does not ask which
    // receipts the manifest describes. An honest merchant manifest, pinned
    // correctly and verifying cleanly, can therefore travel beside a window
    // whose only receipt is noManifest and still leave the report saying the
    // terms were attributed. Nothing in the window was spent under them.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = honestManifest();

    const unbound = receiptFor(honest, "ref-ok", 0, null);
    const report = audit({
      ...balancedWith(honest, rail, unbound),
      manifest: merchant.signed,
      manifestTrust: { publicKeyPem: merchant.keys.publicKeyPem },
    });

    assert.ok(
      report.findings.some((f) => f.id === "manifest") || report.warnings.some((w) => w.id === "manifest"),
      `a manifest matching no receipt must be reported, got findings=${report.findings.map((f) => f.code).join(",") || "none"} warnings=${report.warnings.map((w) => w.code).join(",") || "none"} guarantee=${report.guarantee}`,
    );
    assert.notEqual(
      report.guarantee,
      "unconditional",
      "an unmatched manifest must not leave the guarantee unconditional",
    );
  });

  it("94 the other direction: a manifest the receipts are bound to is not a finding", () => {
    // The pendulum rule. Every fix in this family swung the other way once.
    // A manifest that does cover the window must stay silent.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = honestManifest();

    const bound = receiptFor(honest, "ref-ok", 0, manifestHash(merchant.signed));
    const report = audit({
      ...balancedWith(honest, rail, bound),
      manifest: merchant.signed,
      manifestTrust: { publicKeyPem: merchant.keys.publicKeyPem },
    });

    assert.equal(
      report.findings.length,
      0,
      `a covering manifest must produce no finding, got ${report.findings.map((f) => f.code).join(",")}`,
    );
    assert.equal(report.guarantee, "unconditional");
  });

  it("95 the other direction: a bound receipt with no manifest presented is not made a finding here", () => {
    // -03 is explicit that an audit presented with no Trade Manifest is not
    // made conditional by the manifest root. Reporting the absence here would
    // turn every manifest-less verifier into a wall of findings.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = honestManifest();

    const bound = receiptFor(honest, "ref-ok", 0, manifestHash(merchant.signed));
    const report = audit(balancedWith(honest, rail, bound));

    assert.equal(
      report.findings.length,
      0,
      `no manifest presented must stay silent, got ${report.findings.map((f) => f.code).join(",")}`,
    );
    assert.equal(report.guarantee, "unconditional");
  });
});
