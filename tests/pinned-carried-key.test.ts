import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type AuditReport } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  redactCheckpointTotals,
  signCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { fixtureEd25519Pems } from "@cedulon/cose";
import { generateReceiptKeys, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

import { TEST_HASH } from "./hash-fixtures.ts";

/**
 * Under an issuer pin a carried key has one effect (core-05, issuer root): an
 * object that verifies under the pinned key while carrying another key is
 * carried-key-mismatch, a warning, and stays attested. On master 8be5a67 the
 * checkpoint was attested under the pin and then verified again against the
 * key it carries in four places: the totals comparison and the chain walk
 * failed it, the redaction warning skipped it, and the equivocation pool -
 * presented copies and witness-held copies alike - dropped it, so a second
 * checkpoint for one epoch went unreported once its carried key was swapped.
 */
const S = 1_700_000_000_000;
const E = S + 3_600_000;
const issuer = generateReceiptKeys();
const stranger = generateReceiptKeys();
const rail = generateExtractKeys();

function receipt(nonce: string, ref: string): SignedReceipt {
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
      timestampMs: S + 1_800_000,
      nonce: nonce.padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
}

const swapped = (cp: SignedCheckpoint): SignedCheckpoint => ({ ...cp, publicKeyPem: stranger.publicKeyPem });

function pinnedAudit(receipts: SignedReceipt[], checkpoints: SignedCheckpoint[], extra: Record<string, unknown> = {}): AuditReport {
  const extract = signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: S,
      windowEndMs: E,
      settlements: receipts.map((r) => ({ ref: r.claims.x402PaymentRef!, amount: "1", currency: "USD", timestampMs: S + 1_800_000 })),
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
  return audit({
    receipts,
    checkpoints,
    extract,
    trust: { publicKeyPem: rail.publicKeyPem, accountId: "acct", railId: "rail", windowStartMs: S, windowEndMs: E },
    issuerTrust: { publicKeyPem: issuer.publicKeyPem },
    ...extra,
  });
}

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("a checkpoint attested under the issuer pin is not verified again against the key it carries", () => {
  it("the totals comparison and the chain walk pass it; the swap is carried-key-mismatch, a warning", () => {
    const r = receipt("pk-a", "ref-a");
    const cp = signCheckpoint(buildCheckpointClaims(1, [r], S, E, null), issuer.privateKeyPem, issuer.publicKeyPem);
    const control = pinnedAudit([r], [cp]);
    assert.deepEqual(control.findings, []);
    const report = pinnedAudit([r], [swapped(cp)]);
    assert.deepEqual(codes(report.findings), [], JSON.stringify(report.findings));
    assert.ok(report.warnings.some((w) => w.code === "carried-key-mismatch" && w.id === "epoch-1"), JSON.stringify(report.warnings));
    assert.equal(report.ok, true);
  });

  it("a signed redaction with a swapped carried key is still reported as checkpoint-totals-redacted", () => {
    const r = receipt("pk-b", "ref-b");
    const cp = signCheckpoint(
      redactCheckpointTotals(buildCheckpointClaims(1, [r], S, E, null)),
      issuer.privateKeyPem,
      issuer.publicKeyPem,
    );
    const control = pinnedAudit([r], [cp]);
    assert.ok(control.warnings.some((w) => w.code === "checkpoint-totals-redacted"));
    const report = pinnedAudit([r], [swapped(cp)]);
    assert.ok(
      report.warnings.some((w) => w.code === "checkpoint-totals-redacted" && w.id === "epoch-1"),
      JSON.stringify(report.warnings),
    );
    assert.equal(report.guarantee, "conditional");
  });

  it("two presented checkpoints for one epoch are equivocation even when one carries a swapped key", () => {
    const a = receipt("pk-c", "ref-c");
    const b = receipt("pk-d", "ref-d");
    const first = signCheckpoint(buildCheckpointClaims(1, [a], S, E, null), issuer.privateKeyPem, issuer.publicKeyPem);
    const second = signCheckpoint(buildCheckpointClaims(1, [b], S, E, null), issuer.privateKeyPem, issuer.publicKeyPem);
    const control = pinnedAudit([a], [first, second]);
    assert.ok(control.findings.some((f) => f.code === "equivocation" && f.id === "epoch-1"), JSON.stringify(control.findings));
    const report = pinnedAudit([a], [first, swapped(second)]);
    assert.ok(report.findings.some((f) => f.code === "equivocation" && f.id === "epoch-1"), JSON.stringify(report.findings));
  });

  it("a witness-held copy of an attested checkpoint with a swapped carried key still reaches the equivocation pool", () => {
    const a = receipt("pk-e", "ref-e");
    const b = receipt("pk-f", "ref-f");
    const presented = signCheckpoint(buildCheckpointClaims(1, [a], S, E, null), issuer.privateKeyPem, issuer.publicKeyPem);
    const other = signCheckpoint(buildCheckpointClaims(1, [b], S, E, null), issuer.privateKeyPem, issuer.publicKeyPem);
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const otherReceipt = anchorCheckpoint(ts, other);
    const witness = { witnessTrust: { publicKeyPem: ts.publicKeyPem } };
    const control = pinnedAudit([a], [presented], { ...witness, inclusionReceipts: [presentedReceipt, otherReceipt] });
    assert.ok(control.findings.some((f) => f.code === "equivocation" && f.id === "epoch-1"), JSON.stringify(control.findings));
    assert.ok(otherReceipt.checkpoint, "fixture: the inclusion receipt carries its statement body");
    const tampered = { ...otherReceipt, checkpoint: swapped(otherReceipt.checkpoint!) };
    const report = pinnedAudit([a], [presented], { ...witness, inclusionReceipts: [presentedReceipt, tampered] });
    assert.ok(report.findings.some((f) => f.code === "equivocation" && f.id === "epoch-1"), JSON.stringify(report.findings));
  });
});
