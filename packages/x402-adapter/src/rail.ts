export type RailSettlement = {
  ref: string;
  amount: string;
  currency: string;
  timestampMs: number;
};

/** Mock facilitator / chain extract. In production this is an on-chain or log query. */
export class RailLedger {
  private readonly rows: RailSettlement[] = [];

  record(row: RailSettlement): void {
    this.rows.push({ ...row });
  }

  extract(): RailSettlement[] {
    return this.rows.map((r) => ({ ...r }));
  }

  toJson(): string {
    return JSON.stringify({ settlements: this.extract() });
  }

  static fromJson(text: string): RailSettlement[] {
    const parsed = JSON.parse(text) as { settlements?: RailSettlement[] };
    if (!Array.isArray(parsed.settlements)) {
      throw new Error("rail-extract-shape");
    }
    return parsed.settlements;
  }
}
