import { totalsFromDecisionRecords } from "@cedulon/checkpoint";
import type { DecisionRecordClaims, SignedDecisionRecord } from "@cedulon/core";
import type { EffectRow } from "@cedulon/effect-extract";
import type { ProfileFinding, ReconciliationProfile } from "../profile.ts";

/**
 * Decision-side reconciliation. `MatchCounts.aborted` counts deny+defer:
 * those records do not expect an effect row, the same way a spend
 * `aborted` receipt does not expect a settlement. The counter names stay
 * in the spend dialect; renaming them is a separate decision.
 */
export const DECISION_PROFILE: ReconciliationProfile<SignedDecisionRecord, EffectRow> = {
  id: "decision",
  words: {
    record: "decision record",
    row: "effect",
    extract: "effect extract",
    extractKey: "effect-extract key",
    scope: "effect path",
    account: "decider",
    rail: "channel",
    issuer: "decider",
  },
  recordRef(record) {
    return record.claims.ref;
  },
  expectsRow(record) {
    return record.claims.decision === "allow";
  },
  rowKey(row) {
    return [row.ref, row.effectHash, row.effectClass, row.timestampMs].join("\u0000");
  },
  bind(record, row) {
    if (row.effectHash !== record.claims.effectHash) {
      return {
        ok: false,
        detail: `effect ${row.ref} hash ${row.effectHash} != decision ${record.claims.effectHash}`,
      };
    }
    if (row.effectClass !== record.claims.effectClass) {
      return {
        ok: false,
        code: "effect-class-mismatch",
        detail: `effect ${row.ref} class ${row.effectClass} != decision ${record.claims.effectClass}`,
      };
    }
    return { ok: true };
  },
  aggregate(ref, records, rows) {
    return decisionAggregate(ref, records, rows);
  },
  terms(_record, _manifestTerms) {
    // Policy-document binding is not wired through the Trade Manifest path.
    return [];
  },
  checkpointTotals: totalsFromDecisionRecords,
  codes: {
    recordWithoutRow: "decision-without-effect",
    rowWithoutRecord: "effect-without-decision",
    bindFailure: "effect-mismatch",
    rowAgainstRefusal: "effect-against-refusal",
  },
  recordWithoutRowDetail(record, ref) {
    return `decision nonce=${record.claims.nonce} ref=${ref} has no effect row on the extract`;
  },
  rowWithoutRecordDetail(row) {
    return `effect ${row.ref} has no decision record`;
  },
  rowAgainstRefusalDetail(row) {
    return `effect ${row.ref} exists against a refusal on the same ref`;
  },
  counterpartyUnbound(_rows, _manifestPayeeBound) {
    // No counterparty axis here: `effectHash` binds the content of the
    // effect itself, which is more than a payee name ever bound on spend.
    // `actor` on a row is carried, not measured; measuring it is a later
    // decision, not a warning leaked from the spend rule.
    return null;
  },
};

function decisionAggregate(
  ref: string,
  records: SignedDecisionRecord[],
  rows: EffectRow[],
): ProfileFinding[] {
  // A repeated ref is counted, not summed: there is no amount to add up.
  const findings: ProfileFinding[] = [];
  if (rows.length > records.length) {
    findings.push({
      code: "effect-without-decision",
      id: ref,
      detail: `ref ${ref} has ${rows.length} effect(s) against ${records.length} decision(s)`,
    });
  } else if (rows.length < records.length) {
    findings.push({
      code: "decision-without-effect",
      id: ref,
      detail: `ref ${ref} has ${records.length} decision(s) against ${rows.length} effect(s)`,
    });
  }
  return findings;
}

export type { DecisionRecordClaims };
