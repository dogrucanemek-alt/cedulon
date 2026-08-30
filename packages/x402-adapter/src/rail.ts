import { generateKeyPairSync, verify } from "node:crypto";
import { pemSigner, sameSpkiKey } from "@cedulon/cose";
import { canonical, isValidAmountText, jcsEncodeRefusal } from "@cedulon/core";

/** Table 8 settlement members. A rail may add members; it may not rename these. */
export const SETTLEMENT_CORE_FIELDS = ["ref", "amount", "currency", "timestampMs"] as const;
/** Extract scope members the verifier walks. Extra members are free. */
export const EXTRACT_SCOPE_FIELDS = [
  "accountId",
  "railId",
  "windowStartMs",
  "windowEndMs",
  "settlements",
] as const;
/** Profile default δ when an extract omits `clockSkewMs`. */
export const DEFAULT_CLOCK_SKEW_MS = 300_000;

/**
 * Why this extract body is not the Table 8 / scope shape, by name, or null
 * when it is. signRailExtract and verifyRailExtract both ask this before
 * they encode or check a signature, so a renamed core member and a missing
 * window are the same refusal on both sides.
 */
export function railExtractShapeRefusal(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return "missing-extract-body";
  }
  const rec = body as Record<string, unknown>;
  for (const field of EXTRACT_SCOPE_FIELDS) {
    if (!(field in rec)) {
      return `missing-extract-${field}`;
    }
  }
  if (typeof rec.accountId !== "string") {
    return "missing-extract-accountId";
  }
  if (typeof rec.railId !== "string") {
    return "missing-extract-railId";
  }
  if (typeof rec.windowStartMs !== "number") {
    return "missing-extract-windowStartMs";
  }
  if (typeof rec.windowEndMs !== "number") {
    return "missing-extract-windowEndMs";
  }
  if (!Array.isArray(rec.settlements)) {
    return "missing-extract-settlements";
  }
  for (const row of rec.settlements) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return "renamed-settlement-ref";
    }
    const s = row as Record<string, unknown>;
    for (const field of SETTLEMENT_CORE_FIELDS) {
      if (!(field in s)) {
        return `renamed-settlement-${field}`;
      }
    }
    if (typeof s.ref !== "string") {
      return "renamed-settlement-ref";
    }
    if (!isValidAmountText(s.amount)) {
      return "renamed-settlement-amount";
    }
    if (typeof s.currency !== "string") {
      return "renamed-settlement-currency";
    }
    if (typeof s.timestampMs !== "number") {
      return "renamed-settlement-timestampMs";
    }
    if ("beneficiary" in s && typeof s.beneficiary !== "string") {
      return "malformed-settlement-beneficiary";
    }
  }
  if (
    "clockSkewMs" in rec &&
    (typeof rec.clockSkewMs !== "number" || !Number.isFinite(rec.clockSkewMs))
  ) {
    return "malformed-extract-clockSkewMs";
  }
  return null;
}

export type RailSettlement = {
  ref: string;
  amount: string;
  currency: string;
  timestampMs: number;
  /** When present, compared to the receipt payee. Extra members stay free. */
  beneficiary?: string;
};

export type RailExtractBody = {
  accountId: string;
  railId: string;
  windowStartMs: number;
  windowEndMs: number;
  settlements: RailSettlement[];
  /** Optional δ in ms. Absent ⇒ DEFAULT_CLOCK_SKEW_MS. Extra members stay free. */
  clockSkewMs?: number;
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
  const shape = railExtractShapeRefusal(body);
  if (shape !== null) {
    throw new Error(shape);
  }
  const payload = Buffer.from(canonical(body), "utf8");
  const signature = Buffer.from(pemSigner(privateKeyPem, publicKeyPem).sign(payload)).toString(
    "base64",
  );
  return { body, signature, publicKeyPem };
}

/**
 * `expectedRailKeyPem` is the rail key the verifier holds out of band
 * (`MUST-T10-8`). Omitted, this only proves the extract is internally
 * consistent: any key can sign any body, including its own.
 */
export function verifyRailExtract(signed: SignedRailExtract, expectedRailKeyPem?: string): boolean {
  if (railExtractShapeRefusal(signed.body) !== null) {
    return false;
  }
  if (expectedRailKeyPem !== undefined && !sameSpkiKey(signed.publicKeyPem, expectedRailKeyPem)) {
    return false;
  }
  try {
    // Encoding the body is part of verifying it, so it is inside the try. A
    // body carrying a value RFC 8785 has no encoding for - a non-finite
    // number, which `JSON.parse("1e309")` produces without a syntax error -
    // is a document outside this specification, and the answer to it is
    // "not verified", not an exception thrown through the caller. The
    // producer side is the opposite: signRailExtract must refuse to sign
    // what it cannot encode, and it still does.
    const payload = Buffer.from(canonical(signed.body), "utf8");
    return verify(null, payload, signed.publicKeyPem, Buffer.from(signed.signature, "base64"));
  } catch {
    return false;
  }
}

/**
 * Why encoding this extract's body would refuse, by name, or null when it
 * would not. verifyRailExtract answers only "verified or not"; a report that
 * says "signature failed" for a body the encoder refused has kept the bound
 * and lost the name, and an operator can no longer tell a limit from a
 * forgery. The COSE side splits the same two questions with
 * coseDecodeRefusal; this is the RFC 8785 sibling.
 */
export function railExtractEncodeRefusal(signed: SignedRailExtract): string | null {
  return railExtractShapeRefusal(signed.body) ?? jcsEncodeRefusal(signed.body);
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
