import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type AuditInput } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import {
  generateManifestKeys,
  manifestHash,
  signManifest,
  type SignedManifest,
  type TradeManifestBody,
} from "@cedulon/manifest";
import { generateReceiptKeys, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, type SignedRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; privateKeyPem2?: never; publicKeyPem: string };

type ReceiptShape = {
  amount?: string;
  currency?: string;
  boundTo?: string | null;
  timestampMs?: number;
};

function receiptFor(keys: Keys, ref: string, shape: ReceiptShape = {}): SignedReceipt {
  const boundTo = shape.boundTo ?? null;
  return signReceipt(
    {
      payer: "payer",
      payee: "payee",
      amount: shape.amount ?? "1",
      currency: shape.currency ?? "USD",
      policyHash: "policy-hash",
      manifestHash: boundTo,
      noManifest: boundTo === null,
      x402PaymentRef: ref,
      timestampMs: shape.timestampMs ?? NOW,
      nonce: "n0".padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function railWith(rail: Keys, amount: string, currency: string): SignedRailExtract {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
      settlements: [{ ref: "ref-ok", amount, currency, timestampMs: NOW }],
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function windowFor(honest: Keys, rail: Keys, receipt: SignedReceipt): AuditInput {
  return {
    receipts: [receipt],
    checkpoints: [signCheckpoint(
      buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    )],
    extract: railWith(rail, receipt.claims.amount, receipt.claims.currency),
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

function manifestOf(over: Partial<TradeManifestBody> = {}): { keys: Keys; signed: SignedManifest } {
  const keys = generateManifestKeys();
  const body: TradeManifestBody = {
    description: "one unit of work",
    amount: "1",
    currency: "USD",
    acceptanceCriteriaHash: "criteria-hash",
    cancelCondition: "none",
    expiresAtMs: NOW + 60_000,
    ...over,
  };
  return { keys, signed: signManifest(body, keys.privateKeyPem, keys.publicKeyPem) };
}

function auditWith(receipt: SignedReceipt, m: { keys: Keys; signed: SignedManifest }, honest: Keys, rail: Keys) {
  return audit({
    ...windowFor(honest, rail, receipt),
    manifest: m.signed,
    manifestTrust: { publicKeyPem: m.keys.publicKeyPem },
  });
}

describe("the terms a bound receipt claims to have been spent under", () => {
  it("96 RED: a receipt bound to the manifest hash may state any amount", () => {
    // MUST-T8-2 denies a bound spend whose amount differs from the manifest,
    // and it denies it at the gate. The verifier has no counterpart, so an
    // audit of the settled record cannot see what the gate would have refused.
    // MUST-T4-17 asks whether a receipt names this manifest. It does not ask
    // whether the receipt obeys it.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const m = manifestOf({ amount: "1" });
    const inflated = receiptFor(honest, "ref-ok", { amount: "99", boundTo: manifestHash(m.signed) });

    const report = auditWith(inflated, m, honest, rail);
    const hit = report.findings.find((f) => f.code === "manifest-terms-mismatch");
    assert.ok(
      hit,
      `amount 99 under a manifest of 1 must be reported, got findings=${report.findings.map((f) => f.code).join(",") || "none"} warnings=${report.warnings.map((w) => w.code).join(",") || "none"} guarantee=${report.guarantee}`,
    );
    assert.equal(hit.id, "ref-ok", "the finding names the payment, not the manifest");
    assert.equal(report.ok, false);
    // The guarantee is not the place this lands. It says whether the verifier
    // could speak without qualification, and here every root was supplied, so
    // it could: the unconditional statement is that this payment broke its
    // terms. Downgrading it would confuse a missing root with a real finding.
    assert.equal(report.guarantee, "unconditional");
  });

  it("97 RED: the same holds for currency", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const m = manifestOf({ currency: "USD" });
    const swapped = receiptFor(honest, "ref-ok", { currency: "EUR", boundTo: manifestHash(m.signed) });

    const report = auditWith(swapped, m, honest, rail);
    assert.ok(
      report.findings.some((f) => f.code === "manifest-terms-mismatch"),
      `EUR under a USD manifest must be reported, got ${report.findings.map((f) => f.code).join(",") || "none"}`,
    );
  });

  it("98 RED: a spend after the manifest expiry is the same gap (MUST-T3-3)", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const m = manifestOf({ expiresAtMs: NOW - 1 });
    const late = receiptFor(honest, "ref-ok", { boundTo: manifestHash(m.signed), timestampMs: NOW });

    const report = auditWith(late, m, honest, rail);
    assert.ok(
      report.findings.some((f) => f.code === "manifest-terms-mismatch"),
      `a settled spend after expiry must be reported, got ${report.findings.map((f) => f.code).join(",") || "none"}`,
    );
  });

  it("99 the other direction: terms that agree stay silent", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const m = manifestOf();
    const good = receiptFor(honest, "ref-ok", { boundTo: manifestHash(m.signed) });

    const report = auditWith(good, m, honest, rail);
    assert.equal(report.findings.length, 0, report.findings.map((f) => f.code).join(","));
    assert.equal(report.guarantee, "unconditional");
  });

  it("100 the other direction: an unbound receipt is not judged against a manifest it never named", () => {
    // A window may hold both manifest-bound and noManifest spends. Reading the
    // manifest onto a receipt that does not name it would invent a violation.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const m = manifestOf({ amount: "1" });
    const unbound = receiptFor(honest, "ref-ok", { amount: "99", boundTo: null });

    const report = audit({
      ...windowFor(honest, rail, unbound),
      manifest: m.signed,
      manifestTrust: { publicKeyPem: m.keys.publicKeyPem },
    });
    assert.equal(
      report.findings.some((f) => f.code === "manifest-terms-mismatch"),
      false,
      "an unbound receipt must not be measured against terms it never claimed",
    );
  });
});
