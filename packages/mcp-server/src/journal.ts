/**
 * Append-only intent log for a settlement that leaves this process.
 * `indeterminate` is a journal phase, not a receipt outcome — the wire
 * dictionary stays `settled` | `aborted` until a later draft moves.
 */

export type JournalPhase =
  | "prepared"
  | "submitted"
  | "settled"
  | "failed"
  | "indeterminate";

export type JournalEntry = {
  nonce: string;
  amount: string;
  currency: string;
  payee: string;
  phase: JournalPhase;
  atMs: number;
};

export type FoldedIntent = {
  nonce: string;
  amount: string;
  currency: string;
  payee: string;
  phase: JournalPhase;
  atMs: number;
};

export function foldJournal(entries: readonly JournalEntry[]): FoldedIntent[] {
  const byNonce = new Map<string, FoldedIntent>();
  for (const entry of entries) {
    byNonce.set(entry.nonce, {
      nonce: entry.nonce,
      amount: entry.amount,
      currency: entry.currency,
      payee: entry.payee,
      phase: entry.phase,
      atMs: entry.atMs,
    });
  }
  return [...byNonce.values()];
}

export type ExternalSubmitRow = {
  nonce: string;
  amount: string;
  currency: string;
  payee: string;
};

export type ExternalRail = {
  submit(row: ExternalSubmitRow): "settled" | "failed";
};

/**
 * Test double. `outcome` is public so a crash can be injected without
 * reaching into the session: set it to `"crash"` and `submit` throws
 * `cedulon-rail-crash` after the caller has already written `submitted`.
 */
export class MockExternalRail implements ExternalRail {
  outcome: "settled" | "failed" | "crash";
  lastRow: ExternalSubmitRow | null = null;

  constructor(outcome: "settled" | "failed" | "crash" = "settled") {
    this.outcome = outcome;
  }

  submit(row: ExternalSubmitRow): "settled" | "failed" {
    this.lastRow = row;
    if (this.outcome === "crash") {
      throw new Error("cedulon-rail-crash");
    }
    return this.outcome;
  }
}
