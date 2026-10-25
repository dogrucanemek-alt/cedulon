import { createHash } from "node:crypto";

import { audit, DECISION_PROFILE, type AuditReport } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint, totalsFromDecisionRecords } from "@cedulon/checkpoint";
import {
  decisionRecordHash,
  generateDecisionRecordKeys,
  signDecisionRecord,
  type DecisionRecordClaims,
  type SignedDecisionRecord,
} from "@cedulon/core";
import { generateEffectExtractKeys, signEffectExtract, type EffectRow } from "@cedulon/effect-extract";
import { generateReceiptKeys, receiptHash, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, type SignedRailExtract } from "@cedulon/x402-adapter";

import { TEST_HASH } from "./hash-fixtures.ts";

export const S = 1_700_000_000_000;
export const E = S + 3_600_000;
/** Declared on the spend extracts below, so the bands are easy to read. */
export const SKEW = 1_000;
/** The profile default; an effect extract declares no clockSkewMs. */
export const DEFAULT_SKEW = 300_000;

const issuer = generateReceiptKeys();
const rail = generateExtractKeys();

export function railExtract(
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
      clockSkewMs: SKEW,
      settlements: rows.map((r) => ({ ref: r.ref, amount: "1", currency: "USD", timestampMs: r.timestampMs })),
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

/**
 * One spend audit, both roots pinned, one checkpoint over the presented
 * receipts. Build the receipts with chain() so they form one chain.
 */
export function spendAudit(opts: {
  receipts?: SignedReceipt[];
  rows?: Array<{ ref: string; timestampMs: number }>;
  previousExtract?: SignedRailExtract;
  nextExtract?: SignedRailExtract;
}): { report: AuditReport; input: Parameters<typeof audit>[0] } {
  const receipts = opts.receipts ?? [];
  const checkpoints =
    receipts.length > 0
      ? [signCheckpoint(buildCheckpointClaims(1, receipts, S, E, null), issuer.privateKeyPem, issuer.publicKeyPem)]
      : [];
  const input: Parameters<typeof audit>[0] = {
    receipts,
    checkpoints,
    extract: railExtract(opts.rows ?? []),
    trust: { publicKeyPem: rail.publicKeyPem, accountId: "acct", railId: "rail", windowStartMs: S, windowEndMs: E },
    issuerTrust: { publicKeyPem: issuer.publicKeyPem },
    ...(opts.previousExtract ? { previousExtract: opts.previousExtract } : {}),
    ...(opts.nextExtract ? { nextExtract: opts.nextExtract } : {}),
  };
  return { report: audit(input), input };
}

/** A receipt chain: each receipt names the previous one's hash. */
export function chain(specs: Array<{ ref: string; timestampMs: number; nonce: string }>): SignedReceipt[] {
  const out: SignedReceipt[] = [];
  for (const s of specs) {
    const prev = out.length > 0 ? receiptHash(out[out.length - 1]!) : null;
    out.push(
      signReceipt(
        {
          payer: "payer",
          payee: "payee-1",
          amount: "1",
          currency: "USD",
          policyHash: TEST_HASH,
          manifestHash: null,
          noManifest: true,
          x402PaymentRef: s.ref,
          timestampMs: s.timestampMs,
          nonce: s.nonce.padEnd(16, "-"),
          prevReceiptHash: prev,
          outcome: "settled",
        },
        issuer.privateKeyPem,
        issuer.publicKeyPem,
      ),
    );
  }
  return out;
}


const H = createHash("sha256").update("cedulon/edge-resolver").digest("hex");
const decider = generateDecisionRecordKeys();
const effect = generateEffectExtractKeys();

function decisionClaims(over: Partial<DecisionRecordClaims>): DecisionRecordClaims {
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
    timestampMs: S + 1_800_000,
    nonce: "n-dec".padEnd(16, "-"),
    prevRecordHash: null,
    effectClass: "ig-dm-reply",
    ...over,
  };
}

export function decisionRecord(over: Partial<DecisionRecordClaims>): SignedDecisionRecord {
  return signDecisionRecord(decisionClaims(over), decider.privateKeyPem, decider.publicKeyPem);
}

export function decisionAudit(records: SignedDecisionRecord[], effects: EffectRow[]): AuditReport {
  const checkpoints =
    records.length > 0
      ? [
          signCheckpoint(
            buildCheckpointClaims(1, records, S, E, null, totalsFromDecisionRecords, decisionRecordHash),
            decider.privateKeyPem,
            decider.publicKeyPem,
          ),
        ]
      : [];
  return audit({
    receipts: records,
    checkpoints,
    extract: signEffectExtract(
      { deciderId: "decider-1", channelId: "ig-dm", windowStartMs: S, windowEndMs: E, effects },
      effect.privateKeyPem,
      effect.publicKeyPem,
    ),
    trust: { publicKeyPem: effect.publicKeyPem, accountId: "decider-1", railId: "ig-dm", windowStartMs: S, windowEndMs: E },
    issuerTrust: { publicKeyPem: decider.publicKeyPem },
    profile: DECISION_PROFILE,
  });
}

export function effectRow(ref: string, timestampMs: number): EffectRow {
  return { ref, effectHash: H, effectClass: "ig-dm-reply", timestampMs };
}
