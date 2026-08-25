export type WindowCounters = {
  windowStartMs: number;
  allowedCount: number;
  allowedSum: bigint;
};

export class MemoryStore {
  readonly usedNonces = new Set<string>();
  readonly consumedDecisions = new Set<string>();
  counters: WindowCounters = {
    windowStartMs: 0,
    allowedCount: 0,
    allowedSum: 0n,
  };

  reset(): void {
    this.usedNonces.clear();
    this.consumedDecisions.clear();
    this.counters = { windowStartMs: 0, allowedCount: 0, allowedSum: 0n };
  }
}
