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
};

function decisionAggregate(
  ref: string,
  records: SignedDecisionRecord[],
  rows: EffectRow[],
): ProfileFinding[] {
  const findings: ProfileFinding[] = [];
  const byClass = new Map<string, number>();
  for (const row of rows) {
    byClass.set(row.effectClass, (byClass.get(row.effectClass) ?? 0) + 1);
  }
  const byDecision = new Map<string, number>();
  for (const record of records) {
    const d = record.claims.decision;
    byDecision.set(d, (byDecision.get(d) ?? 0) + 1);
  }
  void byClass;
  void byDecision;
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
