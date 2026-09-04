import { totalsFromReceipts } from "@cedulon/checkpoint";
import type { SignedReceipt } from "@cedulon/receipts";
import type { RailSettlement } from "@cedulon/x402-adapter";

/**
 * Content-binding result for one record against one counterparty row.
 * `detail` is the finding text when the bind fails. `code` is the
 * finding the profile wants for this failure; omitted, the reconciler
 * uses `profile.codes.bindFailure`.
 */
export type BindResult = { ok: true } | { ok: false; detail: string; code?: string };

/** Finding shape the profile may emit. Codes stay in the caller's catalogue. */
export type ProfileFinding = {
  code: string;
  id: string;
  detail: string;
  severity?: "fail" | "warn";
};

/**
 * Report English for one population. `audit()` builds shared sentences from
 * these words so a decision report cannot say "rail" and a spend report
 * stays the sentences the golden file already holds.
 */
export type ProfileWords = {
  record: string;
  row: string;
  extract: string;
  extractKey: string;
  scope: string;
  account: string;
  rail: string;
  issuer: string;
};

/**
 * The five money (or money-shaped) axes a reconciler asks of a population.
 * Spend starts as `SignedReceipt` / `RailSettlement`. A later profile may
 * bind different record and row types; this file does not invent them.
 */
export type ReconciliationProfile<Rec, Row> = {
  id: string;
  words: ProfileWords;
  recordRef(record: Rec): string | null;
  /** Whether this record is expected to have a counterparty row. */
  expectsRow(record: Rec): boolean;
  rowKey(row: Row): string;
  bind(record: Rec, row: Row): BindResult;
  aggregate(ref: string, records: Rec[], rows: Row[]): ProfileFinding[];
  /** Broken-field list against the named terms document; empty if none. */
  terms(record: Rec, manifestTerms: unknown): string[];
  checkpointTotals(records: Rec[]): Record<string, string>;
  /**
   * Finding codes the match walk emits. Spend keeps today's names.
   * `rowAgainstRefusal` is for a row whose ref belongs to a record that
   * does not expect a row (aborted / deny / defer).
   */
  codes: {
    recordWithoutRow: string;
    rowWithoutRecord: string;
    bindFailure: string;
    rowAgainstRefusal: string;
  };
  /**
   * Finding text for the three match-walk outcomes that name one side only.
   * The sentence belongs to the profile: a spend report must not read
   * "effect", and a decision report must not read "rail extract".
   */
  recordWithoutRowDetail(record: Rec, ref: string): string;
  rowWithoutRecordDetail(row: Row): string;
  rowAgainstRefusalDetail(row: Row): string;
  /**
   * The counterparty axis, if the profile has one. Returns the warning
   * text when nothing in the presented population names the other party,
   * null when it is named or when the profile binds content some other
   * way. `manifestPayeeBound` is the caller's word on the manifest, which
   * only the spend path carries.
   */
  counterpartyUnbound(rows: Row[], manifestPayeeBound: boolean): string | null;
};

type SpendTerms = {
  amount: string;
  currency: string;
  expiresAtMs: number;
  payee?: string;
};

function spendAggregate(ref: string, records: SignedReceipt[], rows: RailSettlement[]): ProfileFinding[] {
  const findings: ProfileFinding[] = [];
  let malformed = false;
  const add = (into: Map<string, bigint>, currency: string, amount: string): void => {
    let parsed: bigint;
    try {
      parsed = BigInt(amount);
    } catch {
      // An amount the audit cannot read is itself a finding. Throwing here
      // would take down the whole report over one bad row.
      malformed = true;
      findings.push({
        code: "malformed-amount",
        id: ref,
        detail: `ref ${ref} carries the amount ${JSON.stringify(amount)}, which is not an integer`,
      });
      return;
    }
    into.set(currency, (into.get(currency) ?? 0n) + parsed);
  };

  const settledByCurrency = new Map<string, bigint>();
  for (const row of rows) {
    add(settledByCurrency, row.currency, row.amount);
  }
  const receiptedByCurrency = new Map<string, bigint>();
  for (const record of records) {
    add(receiptedByCurrency, record.claims.currency, record.claims.amount);
  }
  if (malformed) {
    return findings;
  }
  // Walk both sides: a currency that appears only among the receipts is a
  // receipt with nothing settled behind it, and iterating the settled side
  // alone would report nothing at all for it.
  const currencies = new Set([...settledByCurrency.keys(), ...receiptedByCurrency.keys()]);
  for (const currency of currencies) {
    const settled = settledByCurrency.get(currency) ?? 0n;
    const receipted = receiptedByCurrency.get(currency) ?? 0n;
    if (settled > receipted) {
      findings.push({
        code: "settlement-without-receipt",
        id: ref,
        detail: `ref ${ref} settled ${settled} ${currency} against ${receipted} ${currency} receipted; ${settled - receipted} ${currency} unaccounted`,
      });
    } else if (settled < receipted) {
      findings.push({
        code: "settlement-mismatch",
        id: ref,
        detail: `ref ${ref} settled ${settled} ${currency} against ${receipted} ${currency} receipted`,
      });
    }
  }
  return findings;
}

function spendTerms(record: SignedReceipt, manifestTerms: unknown): string[] {
  const terms = manifestTerms as SpendTerms;
  const broken: string[] = [];
  if (record.claims.amount !== terms.amount) {
    broken.push(`amount ${record.claims.amount} against manifest ${terms.amount}`);
  }
  if (record.claims.currency !== terms.currency) {
    broken.push(`currency ${record.claims.currency} against manifest ${terms.currency}`);
  }
  if (record.claims.timestampMs > terms.expiresAtMs) {
    broken.push(`settled at ${record.claims.timestampMs} after the manifest expired at ${terms.expiresAtMs}`);
  }
  if (typeof terms.payee === "string" && record.claims.payee !== terms.payee) {
    broken.push(`payee ${JSON.stringify(record.claims.payee)} against manifest ${JSON.stringify(terms.payee)}`);
  }
  return broken;
}

/** Today's spend reconciler, moved behind the seam. Texts and order unchanged. */
export const SPEND_PROFILE: ReconciliationProfile<SignedReceipt, RailSettlement> = {
  id: "spend",
  words: {
    record: "receipt",
    row: "settlement",
    extract: "rail extract",
    extractKey: "rail key",
    scope: "settlement path",
    account: "account",
    rail: "rail",
    issuer: "issuer",
  },
  recordRef(record) {
    return record.claims.x402PaymentRef;
  },
  expectsRow(record) {
    return record.claims.outcome === "settled";
  },
  rowKey(row) {
    return [row.ref, row.amount, row.currency, row.timestampMs].join("\u0000");
  },
  bind(record, row) {
    if (record.claims.amount !== row.amount || record.claims.currency !== row.currency) {
      return {
        ok: false,
        detail: `settlement ${row.ref} ${row.amount} ${row.currency} != receipt ${record.claims.amount} ${record.claims.currency}`,
      };
    }
    return { ok: true };
  },
  aggregate: spendAggregate,
  terms: spendTerms,
  checkpointTotals: totalsFromReceipts,
  codes: {
    recordWithoutRow: "receipt-without-settlement",
    rowWithoutRecord: "settlement-without-receipt",
    bindFailure: "settlement-mismatch",
    rowAgainstRefusal: "settlement-without-receipt",
  },
  recordWithoutRowDetail(record, ref) {
    return `receipt nonce=${record.claims.nonce} ref=${ref} is not on the rail extract`;
  },
  rowWithoutRecordDetail(row) {
    return `settlement ${row.ref} ${row.amount} ${row.currency} has no spend receipt`;
  },
  rowAgainstRefusalDetail(row) {
    // Spend never told this case apart from a plain uncovered row, and an
    // aborted receipt may still carry the ref it tried. Same sentence.
    return `settlement ${row.ref} ${row.amount} ${row.currency} has no spend receipt`;
  },
  counterpartyUnbound(rows, manifestPayeeBound) {
    const beneficiaryBound = rows.some((s) => "beneficiary" in s && typeof s.beneficiary === "string");
    if (manifestPayeeBound || beneficiaryBound) return null;
    return "counterparty identity was not bound: no manifest states a payee and no reconciled row names a beneficiary, so `ref`, amount and currency are the whole of what ties these settlements to these receipts, whatever the reconciliation itself found";
  },
};
