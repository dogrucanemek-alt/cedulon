import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, DECISION_PROFILE } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint, totalsFromDecisionRecords } from "@cedulon/checkpoint";
import {
  decisionRecordHash,
  decisionRecordToCbor,
  generateDecisionRecordKeys,
  signDecisionRecord,
  type DecisionRecordClaims,
  type SignedDecisionRecord,
} from "@cedulon/core";
import { asSigner, CTY_DECISION_RECORD, signCoseSign1 } from "@cedulon/cose";
import {
  generateEffectExtractKeys,
  signEffectExtract,
  type EffectRow,
} from "@cedulon/effect-extract";
import { signRailExtract } from "@cedulon/x402-adapter";

// @ts-expect-error no declaration file for the offline adapter script
import { runFixture } from "../interop/mizan-ig/ig-adapter.mjs";

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

/** Signed by the decider key but below signDecisionRecord: no claim rules applied. */
function recordBelowApi(over: Partial<DecisionRecordClaims> = {}): SignedDecisionRecord {
  const c = claims(over);
  const cose = signCoseSign1(
    decisionRecordToCbor(c),
    asSigner(decider.privateKeyPem, decider.publicKeyPem),
    CTY_DECISION_RECORD,
  );
  return { claims: c, publicKeyPem: decider.publicKeyPem, encoding: "cose", coseHex: Buffer.from(cose).toString("hex") };
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
    // No counterparty axis on this profile: effectHash binds the content.
    // A spend-shaped "counterparty-unbound" here would be a leaked rule.
    assert.deepEqual(report.warnings.map((w) => w.code), []);
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
    assert.equal(report.counts.receipts.aborted, 1);
    assert.equal(report.counts.receipts.settled, 0);
    assert.equal(report.counts.settlements.rows, 1);
    assert.equal(report.counts.settlements.unmatched, 1);
  });

  it("5: effect, no record → effect-without-decision", () => {
    const report = run([], [row({ ref: "orphan" })]);
    assert.equal(report.findings.some((f) => f.code === "effect-without-decision"), true);
    assert.equal(report.ok, false);
    assert.equal(report.counts.receipts.submitted, 0);
    assert.equal(report.counts.settlements.rows, 1);
    assert.equal(report.counts.settlements.unmatched, 1);
  });

  it("6: allow + effect, only the row hash changes → effect-mismatch", () => {
    const rec = record({ nonce: "n-6".padEnd(16, "-") });
    const report = run([rec], [row({ effectHash: H2 })]);
    assert.equal(report.findings.some((f) => f.code === "effect-mismatch"), true);
    assert.equal(report.ok, false);
    assert.equal(report.counts.receipts.matched, 1);
    assert.equal(report.counts.settlements.matched, 1);
  });

  it("7: same ref two effect rows → duplicate path", () => {
    const rec = record({ nonce: "n-7".padEnd(16, "-") });
    const report = run([rec], [row(), row({ timestampMs: MID + 1 })]);
    assert.equal(report.findings.some((f) => f.code === "duplicate-ref"), true);
    assert.equal(report.counts.settlements.repeated, 2);
    assert.equal(report.counts.receipts.repeated, 1);
    assert.equal(report.ok, false);
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
    assert.equal(report.counts.receipts.unmatched, 1);
    assert.equal(report.counts.settlements.rows, 0);
  });

  it("10: no effect-extract pin → guarantee conditional, unauthenticated-extract", () => {
    const rec = record({ nonce: "n-10".padEnd(16, "-") });
    const report = run([rec], [row()], { omitTrust: true });
    assert.equal(report.guarantee, "conditional");
    assert.equal(report.warnings.some((w) => w.code === "unauthenticated-extract"), true);
    assert.equal(report.counts.receipts.matched, 1);
    assert.equal(report.counts.settlements.matched, 1);
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
    assert.equal(report.counts.receipts.matched, 1);
    assert.equal(report.counts.settlements.matched, 1);
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
    assert.equal(report.counts.receipts.matched, 1);
    assert.equal(report.counts.settlements.matched, 1);
  });

  it("13: a rail extract presented to the decision profile is refused, never reconciled", () => {
    // The population is the profile's call, not the body's. A rail extract
    // signed by the pinned effect key is still the wrong document here.
    const rec = record({ nonce: "n-13".padEnd(16, "-") });
    const rail = signRailExtract(
      {
        accountId: "decider-1",
        railId: "ig-dm",
        windowStartMs: NOW,
        windowEndMs: END,
        settlements: [{ ref: "ref-1", amount: "1", currency: "USD", timestampMs: MID }],
      },
      effect.privateKeyPem,
      effect.publicKeyPem,
    );
    const report = run([rec], [], { extract: rail as unknown as Parameters<typeof audit>[0]["extract"] });
    assert.equal(report.ok, false);
    assert.equal(report.findings.some((f) => f.code === "extract-key-mismatch"), true);
    assert.equal(report.warnings.some((w) => w.code === "settlement-comparison-skipped"), true);
    assert.equal(report.counts.settlements.matched, 0);
  });

  it("14: an effect extract presented to the spend profile is refused, never reconciled", () => {
    // The mirror of 13. Before this case the spend walk read
    // body.settlements off an effect body and threw on undefined.length;
    // a crash is not a finding, and the report never existed.
    let report: ReturnType<typeof audit> | undefined;
    assert.doesNotThrow(() => {
      report = audit({
        receipts: [],
        checkpoints: [],
        extract: extract([row()]) as unknown as Parameters<typeof audit>[0]["extract"],
        trust: { publicKeyPem: effect.publicKeyPem, accountId: "decider-1", railId: "ig-dm", windowStartMs: NOW, windowEndMs: END },
      });
    });
    assert.ok(report);
    assert.equal(report.ok, false);
    assert.equal(report.findings.some((f) => f.id === "extract"), true, report.findings.map((f) => f.code).join(","));
    assert.equal(report.warnings.some((w) => w.code === "settlement-comparison-skipped"), true);
    assert.equal(report.counts.settlements.rows, 0);
    assert.equal(report.counts.settlements.matched, 0);
  });

  it("15: an allow record without a ref, signed below the API, is refused, not passed", () => {
    // The decider is the audited party; its signer applying the rules is
    // not evidence. Before the verifier re-applied them this record was
    // attested, counted unmatched, and the audit still said ok.
    const rec = recordBelowApi({ nonce: "n-15".padEnd(16, "-"), ref: null, effectHash: null });
    const report = run([rec], []);
    assert.equal(report.ok, false);
    assert.equal(report.counts.receipts.attested, 0);
    assert.equal(report.findings.some((f) => f.id === rec.claims.nonce), true, report.findings.map((f) => f.code).join(","));
  });

  it("16: effect extract signed by a key other than the pinned one → extract-key-mismatch", () => {
    const other = generateEffectExtractKeys();
    const rec = record({ nonce: "n-16".padEnd(16, "-") });
    const foreign = signEffectExtract(
      { deciderId: "decider-1", channelId: "ig-dm", windowStartMs: NOW, windowEndMs: END, effects: [row()] },
      other.privateKeyPem,
      other.publicKeyPem,
    );
    const report = run([rec], [], { extract: foreign });
    assert.equal(report.ok, false);
    assert.equal(report.findings.some((f) => f.code === "extract-key-mismatch"), true);
    assert.equal(report.warnings.some((w) => w.code === "settlement-comparison-skipped"), true);
    assert.equal(report.counts.settlements.matched, 0);
    assert.equal(report.counts.receipts.matched, 0);
  });

  it("17: decision record signed by a key other than the pinned decider → issuer-key-mismatch", () => {
    const other = generateDecisionRecordKeys();
    const foreign = signDecisionRecord(claims({ nonce: "n-17".padEnd(16, "-") }), other.privateKeyPem, other.publicKeyPem);
    const report = audit({
      receipts: [foreign],
      checkpoints: [
        signCheckpoint(
          buildCheckpointClaims(1, [foreign], NOW, END, null, totalsFromDecisionRecords, decisionRecordHash),
          other.privateKeyPem,
          other.publicKeyPem,
        ),
      ],
      issuerTrust: { publicKeyPem: decider.publicKeyPem },
      profile: DECISION_PROFILE,
      extract: extract([row()]),
      trust: PIN,
    });
    assert.equal(report.ok, false);
    assert.equal(report.findings.some((f) => f.code === "issuer-key-mismatch"), true);
    assert.equal(report.counts.receipts.attested, 0);
    assert.equal(report.counts.receipts.matched, 0);
    // The row it would have covered is now an effect with no decision behind it.
    assert.equal(report.findings.some((f) => f.code === "effect-without-decision"), true);
  });
});

const SPEND_VOCAB = /\b(settlements?|receipts?|rails?|payees?|beneficiar(y|ies)|spend)\b/i;
const IG_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "interop", "mizan-ig", "fixtures");

type ReportLike = {
  findings: Array<{ code: string; detail: string }>;
  warnings: Array<{ code: string; detail: string }>;
  summary: string;
  guarantee: string;
};

function spendSentences(report: ReportLike, label: string): string[] {
  const hits: string[] = [];
  for (const f of report.findings) {
    if (SPEND_VOCAB.test(f.detail)) hits.push(`${label} finding ${f.code}: ${f.detail}`);
  }
  for (const w of report.warnings) {
    if (SPEND_VOCAB.test(w.detail)) hits.push(`${label} warning ${w.code}: ${w.detail}`);
  }
  if (SPEND_VOCAB.test(report.summary)) hits.push(`${label} summary: ${report.summary}`);
  if (SPEND_VOCAB.test(report.guarantee)) hits.push(`${label} guarantee: ${report.guarantee}`);
  return hits;
}

describe("decision profile: no spend vocabulary", () => {
  it("seventeen cases, four IG fixtures, and the one-sided paths carry no spend words", () => {
    const hits: string[] = [];
    const seen = new Set<string>();

    const take = (label: string, report: ReportLike) => {
      hits.push(...spendSentences(report, label));
      for (const item of [...report.findings, ...report.warnings]) seen.add(item.code);
    };

    // The seventeen conformance cases. Case 14 is a spend-profile audit of the
    // wrong document; its sentences stay in spend words and are not this check.
    take("1", run([sharedAllow], [sharedRow]));
    take("2", run([record({ nonce: "n-2".padEnd(16, "-") })], []));
    take(
      "3",
      run([record({ decision: "deny", ref: null, effectHash: null, nonce: "n-3".padEnd(16, "-") })], []),
    );
    take(
      "4",
      run(
        [
          record({
            decision: "deny",
            effectHash: null,
            nonce: sharedAllow.claims.nonce,
            ref: sharedAllow.claims.ref,
          }),
        ],
        [sharedRow],
      ),
    );
    take("5", run([], [row({ ref: "orphan" })]));
    take("6", run([record({ nonce: "n-6".padEnd(16, "-") })], [row({ effectHash: H2 })]));
    take("7", run([record({ nonce: "n-7".padEnd(16, "-") })], [row(), row({ timestampMs: MID + 1 })]));
    take(
      "8",
      run([record({ nonce: "n-8".padEnd(16, "-"), timestampMs: CLOSING, ref: "ref-late" })], [], {
        nextExtract: extract([row({ ref: "ref-late", timestampMs: END })], END, END + 1_000),
      }),
    );
    take("9", run([record({ nonce: "n-9".padEnd(16, "-") })], [], { omitExtract: true }));
    take("10", run([record({ nonce: "n-10".padEnd(16, "-") })], [row()], { omitTrust: true }));
    const rec11 = record({ nonce: "n-11".padEnd(16, "-") });
    take(
      "11",
      audit({
        receipts: [rec11],
        checkpoints: [checkpoint([rec11])],
        extract: extract([row()]),
        trust: PIN,
        profile: DECISION_PROFILE,
      }),
    );
    const rec12 = record({ nonce: "n-12".padEnd(16, "-") });
    take(
      "12",
      audit({
        receipts: [rec12],
        checkpoints: [checkpoint([rec12])],
        extract: extract([row()]),
        issuerTrust: { publicKeyPem: decider.publicKeyPem },
        trust: { publicKeyPem: effect.publicKeyPem },
        profile: DECISION_PROFILE,
      }),
    );
    const rail = signRailExtract(
      {
        accountId: "decider-1",
        railId: "ig-dm",
        windowStartMs: NOW,
        windowEndMs: END,
        settlements: [{ ref: "ref-1", amount: "1", currency: "USD", timestampMs: MID }],
      },
      effect.privateKeyPem,
      effect.publicKeyPem,
    );
    take(
      "13",
      run([record({ nonce: "n-13".padEnd(16, "-") })], [], {
        extract: rail as unknown as Parameters<typeof audit>[0]["extract"],
      }),
    );
    take("15", run([recordBelowApi({ nonce: "n-15".padEnd(16, "-"), ref: null, effectHash: null })], []));
    const otherEffect = generateEffectExtractKeys();
    take(
      "16",
      run([record({ nonce: "n-16".padEnd(16, "-") })], [], {
        extract: signEffectExtract(
          { deciderId: "decider-1", channelId: "ig-dm", windowStartMs: NOW, windowEndMs: END, effects: [row()] },
          otherEffect.privateKeyPem,
          otherEffect.publicKeyPem,
        ),
      }),
    );
    const otherDecider = generateDecisionRecordKeys();
    const foreign = signDecisionRecord(
      claims({ nonce: "n-17".padEnd(16, "-") }),
      otherDecider.privateKeyPem,
      otherDecider.publicKeyPem,
    );
    take(
      "17",
      audit({
        receipts: [foreign],
        checkpoints: [
          signCheckpoint(
            buildCheckpointClaims(1, [foreign], NOW, END, null, totalsFromDecisionRecords, decisionRecordHash),
            otherDecider.privateKeyPem,
            otherDecider.publicKeyPem,
          ),
        ],
        issuerTrust: { publicKeyPem: decider.publicKeyPem },
        profile: DECISION_PROFILE,
        extract: extract([row()]),
        trust: PIN,
      }),
    );

    for (const name of ["normal-day", "replay-storm", "leaked-refusal", "wrong-text"] as const) {
      take(`ig:${name}`, runFixture(join(IG_FIXTURES, name)) as ReportLike);
    }

    // Opening δ: a row inside the first clock-skew window, no record on that ref.
    take("boundary-opening", run([], [row({ ref: "edge-open", timestampMs: NOW + 1 })]));
    // Closing δ, no following extract: unmatched allow at the trailing edge.
    take(
      "boundary-closing",
      run([record({ nonce: "n-close".padEnd(16, "-"), timestampMs: CLOSING, ref: "edge-close" })], []),
    );

    take(
      "scope-account",
      run([record({ nonce: "n-acc".padEnd(16, "-") })], [row()], {
        trust: { ...PIN, accountId: "other-decider" },
      }),
    );
    take(
      "scope-channel",
      run([record({ nonce: "n-ch".padEnd(16, "-") })], [row()], {
        trust: { ...PIN, railId: "other-channel" },
      }),
    );
    take(
      "scope-window-start",
      run([record({ nonce: "n-ws".padEnd(16, "-") })], [row()], {
        trust: { ...PIN, windowStartMs: NOW - 1 },
      }),
    );
    take(
      "scope-window-end",
      run([record({ nonce: "n-we".padEnd(16, "-") })], [row()], {
        trust: { ...PIN, windowEndMs: END + 1 },
      }),
    );

    const chainFirst = record({ nonce: "n-c1".padEnd(16, "-") });
    const chainSecond = record({
      nonce: "n-c2".padEnd(16, "-"),
      prevRecordHash: H,
      timestampMs: MID + 1,
    });
    take("receipt-chain-break", run([chainFirst, chainSecond], []));

    const totRec = record({ nonce: "n-tot".padEnd(16, "-") });
    take(
      "checkpoint-total-mismatch",
      audit({
        receipts: [totRec],
        checkpoints: [
          signCheckpoint(
            buildCheckpointClaims(
              1,
              [totRec],
              NOW,
              END,
              null,
              () => ({ allow: "99", deny: "0", defer: "0" }),
              decisionRecordHash,
            ),
            decider.privateKeyPem,
            decider.publicKeyPem,
          ),
        ],
        extract: extract([row()]),
        trust: PIN,
        issuerTrust: { publicKeyPem: decider.publicKeyPem },
        profile: DECISION_PROFILE,
      }),
    );

    const lateRec = record({ nonce: "n-win".padEnd(16, "-"), timestampMs: NOW - 10_000 });
    const windowPeer = record({ nonce: "n-win2".padEnd(16, "-") });
    take(
      "window-coverage",
      audit({
        receipts: [lateRec],
        checkpoints: [checkpoint([windowPeer])],
        extract: extract([]),
        trust: PIN,
        issuerTrust: { publicKeyPem: decider.publicKeyPem },
        profile: DECISION_PROFILE,
      }),
    );

    const carryRec = record({ nonce: "n-carry".padEnd(16, "-") });
    const honestCp = checkpoint([carryRec]);
    const otherPem = generateDecisionRecordKeys().publicKeyPem;
    take(
      "carried-key-mismatch",
      audit({
        receipts: [carryRec],
        checkpoints: [{ ...honestCp, publicKeyPem: otherPem }],
        extract: extract([row()]),
        trust: PIN,
        issuerTrust: { publicKeyPem: decider.publicKeyPem },
        profile: DECISION_PROFILE,
      }),
    );

    // Spend-only on this profile: findReceiptDefects never sees a decision record.
    // The input is here so the watcher does not skip the path by omission.
    take(
      "settled-without-ref",
      run([recordBelowApi({ nonce: "n-noref".padEnd(16, "-"), ref: null, effectHash: null })], []),
    );

    const required = [
      "unauthenticated-extract",
      "unauthenticated-issuer",
      "extract-key-mismatch",
      "extract-scope-mismatch",
      "issuer-key-mismatch",
      "carried-key-mismatch",
      "receipt-chain-break",
      "checkpoint-total-mismatch",
      "window-coverage",
      "unstated-audit-window",
      "unstated-audit-scope",
      "duplicate-ref",
      "boundary-deferred",
    ];
    const missing = required.filter((code) => !seen.has(code));
    assert.deepEqual(missing, [], `watcher did not reach ${missing.join(", ")}`);
    assert.equal(
      hits.length,
      0,
      `${hits.length} spend sentence(s) on the decision profile:\n${hits.join("\n")}`,
    );
  });
});
