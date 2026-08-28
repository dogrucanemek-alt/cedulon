import { generateKeyPairSync, sign, verify } from "node:crypto";
import { canonical } from "@cedulon/core";

export type RailSettlement = {
  ref: string;
  amount: string;
  currency: string;
  timestampMs: number;
};

export type RailExtractBody = {
  accountId: string;
  railId: string;
  windowStartMs: number;
  windowEndMs: number;
  settlements: RailSettlement[];
};

export type SignedRailExtract = {
  body: RailExtractBody;
  signature: string;
  publicKeyPem: string;
};

export function generateExtractKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signRailExtract(
  body: RailExtractBody,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedRailExtract {
  const payload = Buffer.from(canonical(body), "utf8");
  const signature = sign(null, payload, privateKeyPem).toString("base64");
  return { body, signature, publicKeyPem };
}

export function verifyRailExtract(signed: SignedRailExtract): boolean {
  const payload = Buffer.from(canonical(signed.body), "utf8");
  try {
    return verify(null, payload, signed.publicKeyPem, Buffer.from(signed.signature, "base64"));
  } catch {
    return false;
  }
}

function extractBodyOf(rows: RailSettlement[], accountId: string, railId: string): RailExtractBody {
  const times = rows.map((r) => r.timestampMs);
  return {
    accountId,
    railId,
    windowStartMs: times.length === 0 ? 0 : Math.min(...times),
    windowEndMs: times.length === 0 ? 0 : Math.max(...times) + 1,
    settlements: rows.map((r) => ({ ...r })),
  };
}

/** Mock facilitator / chain extract. In production this is an on-chain or log query. */
export class RailLedger {
  private readonly rows: RailSettlement[] = [];

  record(row: RailSettlement): void {
    this.rows.push({ ...row });
  }

  extract(): RailSettlement[] {
    return this.rows.map((r) => ({ ...r }));
  }

  /**
   * Put the ledger back to a set of rows. A caller that has to undo a settlement
   * it could not record needs this: a row left behind is a settlement with no
   * receipt, which is the condition the whole protocol exists to rule out.
   */
  restore(rows: RailSettlement[]): void {
    this.rows.length = 0;
    for (const row of rows) {
      this.rows.push({ ...row });
    }
  }

  signedExtract(
    privateKeyPem: string,
    publicKeyPem: string,
    accountId = "mock-account",
    railId = "mock-rail",
  ): SignedRailExtract {
    return signRailExtract(extractBodyOf(this.rows, accountId, railId), privateKeyPem, publicKeyPem);
  }

  toJson(): string {
    return JSON.stringify({ settlements: this.extract() });
  }

  static fromJson(text: string): RailSettlement[] {
    const parsed = JSON.parse(text) as { settlements?: RailSettlement[] };
    if (!Array.isArray(parsed.settlements)) {
      throw new Error("rail-extract-shape");
    }
    for (const row of parsed.settlements) {
      if (
        typeof row.ref !== "string" ||
        typeof row.amount !== "string" ||
        typeof row.currency !== "string" ||
        typeof row.timestampMs !== "number"
      ) {
        throw new Error("rail-extract-record");
      }
    }
    return parsed.settlements;
  }
}
