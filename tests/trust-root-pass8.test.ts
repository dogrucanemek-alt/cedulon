import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type AuditInput } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint, verifyCheckpoint } from "@cedulon/checkpoint";
import { signDecisionToken, verifyDecisionToken } from "@cedulon/core";
import { generateManifestKeys, signManifest, verifyManifest, type SignedManifest } from "@cedulon/manifest";
import {
  generateReceiptKeys,
  makeDisputeBundle,
  signReceipt,
  verifyDisputeBundle,
  verifyReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import {
  generateExtractKeys,
  signRailExtract,
  verifyRailExtract,
  type SignedRailExtract,
} from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(keys: Keys, ref: string, i: number): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee",
      amount: "1",
      currency: "USD",
      policyHash: "policy-hash",
      manifestHash: null,
      noManifest: true,
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

function checkpointFor(keys: Keys, receipts: SignedReceipt[]) {
  return signCheckpoint(
    buildCheckpointClaims(1, receipts, NOW, WINDOW_END, null),
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

function railPin(rail: Keys) {
  return {
    publicKeyPem: rail.publicKeyPem,
    accountId: "acct",
    railId: "rail",
    windowStartMs: NOW,
    windowEndMs: WINDOW_END,
  };
}

function manifestBody() {
  return {
    description: "one unit of work",
    amount: "1",
    currency: "USD",
    acceptanceCriteriaHash: "criteria-hash",
    cancelCondition: "none",
    expiresAtMs: NOW + 60_000,
  };
}

function balanced(honest: Keys, rail: Keys): AuditInput {
  const good = receiptFor(honest, "ref-ok", 0);
  return {
    receipts: [good],
    checkpoints: [checkpointFor(honest, [good])],
    extract: railWith(rail),
    trust: railPin(rail),
    issuerTrust: { publicKeyPem: honest.publicKeyPem },
  };
}

function withManifest(input: AuditInput, manifest: SignedManifest, pin?: string | readonly string[]): AuditInput {
  return {
    ...input,
    manifest,
    ...(pin === undefined ? {} : { manifestTrust: { publicKeyPem: pin } }),
  };
}

describe("the manifest root", () => {
  it("90 RED then GREEN: an attacker-signed manifest passes the audit with no findings", () => {
    // The published 0.3.1 path: audit() has no manifest root, so a presented
    // Trade Manifest is dropped on the floor. verifyManifest without a pin
    // then answers its own question. Together that is the fifth copy of the
    // self-authenticating loop -03 closed for issuer, payee, witness and
    // decision.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const attacker = generateManifestKeys();
    const forged = signManifest(manifestBody(), attacker.privateKeyPem, attacker.publicKeyPem);

    const silent = audit(withManifest(balanced(honest, rail), forged));
    assert.ok(
      silent.warnings.some((w) => w.code === "unauthenticated-manifest"),
      `presented, unpinned: expected unauthenticated-manifest, got findings=${silent.findings.map((f) => f.code).join(",") || "none"} warnings=${silent.warnings.map((w) => w.code).join(",") || "none"} ok=${silent.ok} guarantee=${silent.guarantee}`,
    );
    assert.equal(silent.guarantee, "conditional");

    const merchant = generateManifestKeys();
    const pinned = audit(withManifest(balanced(honest, rail), forged, merchant.publicKeyPem));
    assert.equal(pinned.ok, false, "a pin the manifest does not answer to must fail the audit");
    assert.ok(
      pinned.findings.some((f) => f.code === "manifest-key-mismatch"),
      `pinned to the merchant: expected manifest-key-mismatch, got ${pinned.findings.map((f) => f.code).join(",") || "none"}`,
    );
  });

  it("91 RED then GREEN: a no-manifest audit is not made conditional by the fifth root", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const report = audit(balanced(honest, rail));
    assert.equal(report.findings.length, 0, report.findings.map((f) => f.code).join(","));
    assert.equal(
      report.warnings.some((w) => w.code === "unauthenticated-manifest"),
      false,
      "a deployment that presents no manifest is not a missing-root gap",
    );
    assert.equal(report.guarantee, "unconditional");
  });

  it("92 RED then GREEN: an unreadable manifest pin is a configuration fault", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = generateManifestKeys();
    const signed = signManifest(manifestBody(), merchant.privateKeyPem, merchant.publicKeyPem);
    const report = audit(withManifest(balanced(honest, rail), signed, "not-a-key"));
    assert.ok(report.findings.some((f) => f.code === "trust-key-unreadable" && f.id === "manifest"));
    assert.equal(report.ok, false);
    assert.equal(report.guarantee, "conditional");
  });

  it("93 GREEN on arrival once 90 is closed: a pinned honest manifest stays silent", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = generateManifestKeys();
    const signed = signManifest(manifestBody(), merchant.privateKeyPem, merchant.publicKeyPem);
    const report = audit(withManifest(balanced(honest, rail), signed, merchant.publicKeyPem));
    assert.equal(report.findings.length, 0, report.findings.map((f) => f.code).join(","));
    assert.equal(
      report.warnings.some((w) => w.code === "unauthenticated-manifest" || w.code === "trust-key-unreadable"),
      false,
    );
    assert.equal(report.guarantee, "unconditional");
  });
});

describe("pin optionality, measured rather than guessed", () => {
  it("94 measures what each verify function does without a pin", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = generateManifestKeys();
    const forgedManifest = signManifest(manifestBody(), attacker.privateKeyPem, attacker.publicKeyPem);
    const honestManifest = signManifest(manifestBody(), merchant.privateKeyPem, merchant.publicKeyPem);
    const receipt = receiptFor(attacker, "ref-x", 0);
    const extract = railWith(rail);

    assert.equal(verifyManifest(forgedManifest), true, "verifyManifest unpinned: self-check passes");
    assert.equal(verifyManifest(forgedManifest, merchant.publicKeyPem), false, "verifyManifest pinned: foreign key fails");
    assert.equal(verifyManifest(honestManifest, merchant.publicKeyPem), true);

    assert.equal(verifyReceipt(receipt), true, "verifyReceipt unpinned: self-check passes");
    assert.equal(verifyReceipt(receipt, honest.publicKeyPem), false);

    assert.equal(verifyRailExtract(extract), true, "verifyRailExtract unpinned: self-check passes");
    assert.equal(
      verifyRailExtract(extract, honest.publicKeyPem),
      false,
      "verifyRailExtract must take the rail pin so MUST-T10-8 can be asked here, not only later in audit()",
    );
    assert.equal(verifyRailExtract(extract, rail.publicKeyPem), true);

    const cp = checkpointFor(attacker, [receipt]);
    assert.equal(verifyCheckpoint(cp), true, "verifyCheckpoint unpinned: self-check passes");
    assert.equal(verifyCheckpoint(cp, honest.publicKeyPem), false);

    const token = signDecisionToken(
      {
        requestHash: "req",
        policyHash: "policy-hash",
        expiryMs: NOW + 60_000,
        nonce: "n0".padEnd(16, "-"),
        singleUseId: "single",
      },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );
    assert.equal(verifyDecisionToken(token, NOW), true, "verifyDecisionToken unpinned: self-check passes");
    assert.equal(verifyDecisionToken(token, NOW, honest.publicKeyPem), false);

    const bundle = makeDisputeBundle({
      manifestCanonical: "m",
      receiptCanonical: "r",
      deliveryBytes: Buffer.from("x"),
      acceptanceCriteriaHash: "not-the-hash",
    });
    assert.equal(verifyDisputeBundle(bundle), true, "verifyDisputeBundle is hash consistency, not a signature");
  });
});
