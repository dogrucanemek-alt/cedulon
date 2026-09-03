import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, DECISION_PROFILE } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint, totalsFromDecisionRecords } from "@cedulon/checkpoint";
import {
  decisionRecordHash,
  generateDecisionRecordKeys,
  signDecisionRecord,
  type DecisionRecordClaims,
  type SignedDecisionRecord,
} from "@cedulon/core";
import {
  generateEffectExtractKeys,
  signEffectExtract,
  type EffectRow,
} from "@cedulon/effect-extract";

const H = createHash("sha256").update("cedulon/decision-profile").digest("hex");
const H2 = createHash("sha256").update("cedulon/decision-profile-other").digest("hex");
const NOW = 1_700_000_000_000;
const END = NOW + 3_600_000;
const MID = NOW + 1_800_000;
const CLOSING = END - 1;

const decider = generateDecisionRecordKeys();
const effect = generateEffectExtractKeys();

function claims(over: Partial<DecisionRecordClaims> = {}): DecisionRecordClaims {
  return {
    decider: "decider-1",
    subject: "subject-1",
    requestHash: H,
    policyHash: H,
    inputsHash: null,
    decision: "allow",
    reasonCode: "ok",
    ref: "ref-1",
    effectHash: H,
    timestampMs: MID,
    nonce: "n-dec".padEnd(16, "-"),
    prevRecordHash: null,
    ...over,
  };
}

function record(over: Partial<DecisionRecordClaims> = {}): SignedDecisionRecord {
  return signDecisionRecord(claims(over), decider.privateKeyPem, decider.publicKeyPem);
}

function row(over: Partial<EffectRow> = {}): EffectRow {
  return {
    ref: "ref-1",
    effectHash: H,
    effectClass: "ig-dm-reply",
    timestampMs: MID,
    ...over,
  };
}

function extract(rows: EffectRow[], ws = NOW, we = END) {
  return signEffectExtract(
    { deciderId: "decider-1", channelId: "ig-dm", windowStartMs: ws, windowEndMs: we, effects: rows },
    effect.privateKeyPem,
    effect.publicKeyPem,
  );
}

function checkpoint(records: SignedDecisionRecord[]) {
  return signCheckpoint(
    buildCheckpointClaims(1, records, NOW, END, null, totalsFromDecisionRecords, decisionRecordHash),
    decider.privateKeyPem,
    decider.publicKeyPem,
  );
}

const PIN = {
  publicKeyPem: effect.publicKeyPem,
  accountId: "decider-1",
  railId: "ig-dm",
  windowStartMs: NOW,
  windowEndMs: END,
};

type RunExtra = Partial<Parameters<typeof audit>[0]> & {
  omitExtract?: boolean;
  omitTrust?: boolean;
};

function run(records: SignedDecisionRecord[], rows: EffectRow[], extra: RunExtra = {}) {
  const { omitExtract, omitTrust, ...rest } = extra;
  return audit({
    receipts: records,
    checkpoints: records.length === 0 ? [] : [checkpoint(records)],
    issuerTrust: { publicKeyPem: decider.publicKeyPem },
    profile: DECISION_PROFILE,
    ...(omitExtract ? {} : { extract: extract(rows) }),
    ...(omitTrust ? {} : { trust: PIN }),
    ...rest,
  });
}

// Cases 1 and 4 share one fixture; 4 only flips the decision to deny.
const sharedAllow = record();
const sharedRow = row();

describe("decision profile conformance", () => {
  it("1: allow + matching effect → matched 1, no findings", () => {
    const report = run([sharedAllow], [sharedRow]);
    assert.equal(report.ok, true, report.findings.map((f) => f.code).join(","));
    assert.equal(report.counts.receipts.matched, 1);
    assert.equal(report.counts.settlements.matched, 1);
    assert.equal(report.findings.length, 0);
  });

  it("2: allow, no effect → decision-without-effect, unmatched 1", () => {
    const report = run([record({ nonce: "n-2".padEnd(16, "-") })], []);
    assert.equal(report.findings.some((f) => f.code === "decision-without-effect"), true);
    assert.equal(report.counts.receipts.unmatched, 1);
    assert.equal(report.ok, false);
  });

  it("3: deny, no effect → aborted 1, balanced", () => {
    const report = run(
      [record({ decision: "deny", ref: null, effectHash: null, nonce: "n-3".padEnd(16, "-") })],
      [],
    );
    assert.equal(report.counts.receipts.aborted, 1);
    assert.equal(report.counts.receipts.settled, 0);
    assert.equal(report.ok, true, report.findings.map((f) => f.code).join(","));
  });

  it("4: deny + effect (same fixture as 1, decision flipped) → effect-against-refusal", () => {
    const denied = record({
      decision: "deny",
      effectHash: null,
      nonce: sharedAllow.claims.nonce,
      ref: sharedAllow.claims.ref,
    });
    const report = run([denied], [sharedRow]);
    assert.equal(report.findings.some((f) => f.code === "effect-against-refusal"), true);
    assert.equal(report.ok, false);
  });

  it("5: effect, no record → effect-without-decision", () => {
    const report = run([], [row({ ref: "orphan" })]);
    assert.equal(report.findings.some((f) => f.code === "effect-without-decision"), true);
    assert.equal(report.ok, false);
  });

  it("6: allow + effect, only the row hash changes → effect-mismatch", () => {
    const rec = record({ nonce: "n-6".padEnd(16, "-") });
    const report = run([rec], [row({ effectHash: H2 })]);
    assert.equal(report.findings.some((f) => f.code === "effect-mismatch"), true);
    assert.equal(report.ok, false);
  });

  it("7: same ref two effect rows → duplicate path", () => {
    const rec = record({ nonce: "n-7".padEnd(16, "-") });
    const report = run([rec], [row(), row({ timestampMs: MID + 1 })]);
    assert.equal(report.findings.some((f) => f.code === "duplicate-ref"), true);
    assert.equal(report.counts.settlements.repeated, 2);
  });

  it("8: closing-boundary record + nextExtract names the ref → carried 1", () => {
    const late = record({ nonce: "n-8".padEnd(16, "-"), timestampMs: CLOSING, ref: "ref-late" });
    const report = run([late], [], {
      nextExtract: extract([row({ ref: "ref-late", timestampMs: END })], END, END + 1_000),
    });
    assert.equal(report.counts.receipts.carried, 1);
    assert.equal(report.findings.length, 0, report.findings.map((f) => f.code).join(","));
    assert.equal(report.ok, true);
  });

  it("9: extract absent → FAIL + conditional (known, same as spend)", () => {
    // FAIL from absence, known, same as spend (draft-abak -01 review, 3 Sep)
    const report = run([record({ nonce: "n-9".padEnd(16, "-") })], [], { omitExtract: true });
    assert.equal(report.ok, false);
    assert.equal(report.guarantee, "conditional");
    assert.equal(report.warnings.some((w) => w.code === "unauthenticated-extract"), true);
  });

  it("10: no effect-extract pin → guarantee conditional, unauthenticated-extract", () => {
    const rec = record({ nonce: "n-10".padEnd(16, "-") });
    const report = run([rec], [row()], { omitTrust: true });
    assert.equal(report.guarantee, "conditional");
    assert.equal(report.warnings.some((w) => w.code === "unauthenticated-extract"), true);
  });

  it("11: no decider pin → unauthenticated-issuer", () => {
    const rec = record({ nonce: "n-11".padEnd(16, "-") });
    const report = audit({
      receipts: [rec],
      checkpoints: [checkpoint([rec])],
      extract: extract([row()]),
      trust: PIN,
      profile: DECISION_PROFILE,
    });
    assert.equal(report.warnings.some((w) => w.code === "unauthenticated-issuer"), true);
    assert.equal(report.guarantee, "conditional");
  });

  it("12: window/scope unstated still fire on the decision profile", () => {
    const rec = record({ nonce: "n-12".padEnd(16, "-") });
    const report = audit({
      receipts: [rec],
      checkpoints: [checkpoint([rec])],
      extract: extract([row()]),
      issuerTrust: { publicKeyPem: decider.publicKeyPem },
      trust: { publicKeyPem: effect.publicKeyPem },
      profile: DECISION_PROFILE,
    });
    assert.equal(report.warnings.some((w) => w.code === "unstated-audit-window"), true);
    assert.equal(report.warnings.some((w) => w.code === "unstated-audit-scope"), true);
    assert.equal(report.guarantee, "conditional");
  });
});
