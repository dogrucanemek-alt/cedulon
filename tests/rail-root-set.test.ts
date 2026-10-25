import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type AuditReport } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, type SignedRailExtract } from "@cedulon/x402-adapter";

import { TEST_HASH } from "./hash-fixtures.ts";

/**
 * MUST-T4-12: a verifier accepts an issuer, publisher, witness or rail root of
 * more than one key, so a rotation inside the audited window does not force it
 * to stop pinning. The issuer, publisher and witness pins already take a set;
 * on master 8be5a67 the rail pin took one key, so a rail that rotated between
 * two windows could not be audited across them with its pin in place.
 */
const S = 1_700_000_000_000;
const E = S + 3_600_000;
const issuer = generateReceiptKeys();
const oldRail = generateExtractKeys();
const newRail = generateExtractKeys();

function receipt(nonce: string, ref: string, timestampMs: number): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee-1",
      amount: "1",
      currency: "USD",
      policyHash: TEST_HASH,
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: ref,
      timestampMs,
      nonce: nonce.padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
}

function extract(
  keys: { privateKeyPem: string; publicKeyPem: string },
  rows: Array<{ ref: string; timestampMs: number }>,
  windowStartMs = S,
  windowEndMs = E,
): SignedRailExtract {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs,
      windowEndMs,
      settlements: rows.map((r) => ({ ref: r.ref, amount: "1", currency: "USD", timestampMs: r.timestampMs })),
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function run(railPin: string | readonly string[], ex: SignedRailExtract, r: SignedReceipt, extra: Record<string, unknown> = {}): AuditReport {
  return audit({
    receipts: [r],
    checkpoints: [signCheckpoint(buildCheckpointClaims(1, [r], S, E, null), issuer.privateKeyPem, issuer.publicKeyPem)],
    extract: ex,
    trust: { publicKeyPem: railPin as string, accountId: "acct", railId: "rail", windowStartMs: S, windowEndMs: E },
    issuerTrust: { publicKeyPem: issuer.publicKeyPem },
    ...extra,
  });
}

describe("the rail root may be a set of keys (MUST-T4-12)", () => {
  it("an extract signed by either key of the set is accepted", () => {
    const r = receipt("rs-a", "ref-a", S + 1_800_000);
    for (const signer of [oldRail, newRail]) {
      const report = run([oldRail.publicKeyPem, newRail.publicKeyPem], extract(signer, [{ ref: "ref-a", timestampMs: S + 1_800_000 }]), r);
      assert.deepEqual(report.findings, [], JSON.stringify(report.findings));
      assert.equal(report.ok, true);
    }
  });

  it("an extract signed by a key outside the set is extract-key-mismatch", () => {
    const r = receipt("rs-b", "ref-b", S + 1_800_000);
    const outsider = generateExtractKeys();
    const report = run([oldRail.publicKeyPem, newRail.publicKeyPem], extract(outsider, [{ ref: "ref-b", timestampMs: S + 1_800_000 }]), r);
    assert.ok(report.findings.some((f) => f.code === "extract-key-mismatch"), JSON.stringify(report.findings));
  });

  it("a single key is still accepted as a string, as before", () => {
    const r = receipt("rs-c", "ref-c", S + 1_800_000);
    const report = run(newRail.publicKeyPem, extract(newRail, [{ ref: "ref-c", timestampMs: S + 1_800_000 }]), r);
    assert.deepEqual(report.findings, []);
  });

  it("an unreadable key in the set is trust-key-unreadable and the readable ones are still used", () => {
    const r = receipt("rs-d", "ref-d", S + 1_800_000);
    const report = run(["not a key", newRail.publicKeyPem], extract(newRail, [{ ref: "ref-d", timestampMs: S + 1_800_000 }]), r);
    assert.ok(report.findings.some((f) => f.code === "trust-key-unreadable" && f.id === "extract"), JSON.stringify(report.findings));
    assert.ok(!report.findings.some((f) => f.code === "extract-key-mismatch"), JSON.stringify(report.findings));
  });

  it("a set with no readable key is trust-key-unreadable, not a mismatch", () => {
    const r = receipt("rs-e", "ref-e", S + 1_800_000);
    const report = run(["not a key", "nor this"], extract(newRail, [{ ref: "ref-e", timestampMs: S + 1_800_000 }]), r);
    assert.ok(report.findings.some((f) => f.code === "trust-key-unreadable" && f.id === "extract"), JSON.stringify(report.findings));
    assert.ok(!report.findings.some((f) => f.code === "extract-key-mismatch"), JSON.stringify(report.findings));
  });

  it("a rail that rotated at the window edge: the following window's extract, signed by the new key, carries the receipt", () => {
    const r = receipt("rs-f", "ref-f", E - 10);
    const report = run(
      [oldRail.publicKeyPem, newRail.publicKeyPem],
      extract(oldRail, []),
      r,
      { nextExtract: extract(newRail, [{ ref: "ref-f", timestampMs: E + 100 }], E, E + 3_600_000) },
    );
    assert.equal(report.counts.receipts.carried, 1, JSON.stringify({ counts: report.counts, findings: report.findings }));
    assert.deepEqual(report.findings, [], JSON.stringify(report.findings));
  });
});
