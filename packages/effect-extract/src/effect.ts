import { generateKeyPairSync, verify } from "node:crypto";
import { pemSigner, sameSpkiKey } from "@cedulon/cose";
import { canonical, hashClaimRefusal, jcsEncodeRefusal, jsonDuplicateMemberName, parseIJson } from "@cedulon/core";

export const CTY_EFFECT_EXTRACT = "application/cedulon-effect-extract+cbor";

const BODY_FIELDS = ["deciderId", "channelId", "windowStartMs", "windowEndMs", "effects"] as const;
const ROW_FIELDS = ["ref", "effectHash", "effectClass", "timestampMs", "actor"] as const;

export type EffectRow = {
  ref: string;
  effectHash: string;
  effectClass: string;
  timestampMs: number;
  actor?: string;
};

export type EffectExtractClaims = {
  deciderId: string;
  channelId: string;
  windowStartMs: number;
  windowEndMs: number;
  effects: EffectRow[];
};

export type SignedEffectExtract = {
  body: EffectExtractClaims;
  signature: string;
  publicKeyPem: string;
};

export function generateEffectExtractKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function effectExtractTextRefusal(text: string): string | null {
  return jsonDuplicateMemberName(text) === null ? null : "json-duplicate-key";
}

function unknownField(rec: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(rec)) {
    if (!allowed.includes(key)) {
      return `unknown-effect-field-${key}`;
    }
  }
  return null;
}

/**
 * Why this extract body is not the effect-extract shape, by name, or null
 * when it is. Unknown fields are refused (unlike a rail extract, which
 * leaves extra members free): the decision profile has no "rail may add
 * members" clause yet.
 */
export function effectExtractShapeRefusal(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return "missing-extract-body";
  }
  const rec = body as Record<string, unknown>;
  const extra = unknownField(rec, BODY_FIELDS);
  if (extra) return extra;
  for (const field of BODY_FIELDS) {
    if (!(field in rec)) {
      return `missing-extract-${field}`;
    }
  }
  if (typeof rec.deciderId !== "string" || rec.deciderId === "") {
    return "missing-extract-deciderId";
  }
  if (typeof rec.channelId !== "string" || rec.channelId === "") {
    return "missing-extract-channelId";
  }
  if (typeof rec.windowStartMs !== "number" || !Number.isSafeInteger(rec.windowStartMs)) {
    return "malformed-extract-windowStartMs";
  }
  if (typeof rec.windowEndMs !== "number" || !Number.isSafeInteger(rec.windowEndMs)) {
    return "malformed-extract-windowEndMs";
  }
  if ((rec.windowEndMs as number) <= (rec.windowStartMs as number)) {
    return "malformed-extract-window";
  }
  if (!Array.isArray(rec.effects)) {
    return "missing-extract-effects";
  }
  for (const row of rec.effects) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return "renamed-effect-ref";
    }
    const s = row as Record<string, unknown>;
    const rowExtra = unknownField(s, ROW_FIELDS);
    if (rowExtra) return rowExtra;
    for (const field of ["ref", "effectHash", "effectClass", "timestampMs"] as const) {
      if (!(field in s)) {
        return `renamed-effect-${field}`;
      }
    }
    if (typeof s.ref !== "string" || s.ref === "") {
      return "empty-effect-ref";
    }
    const hash = hashClaimRefusal("effectHash", s.effectHash);
    if (hash) {
      return hash;
    }
    if (typeof s.effectClass !== "string" || s.effectClass === "") {
      return "renamed-effect-effectClass";
    }
    if (typeof s.timestampMs !== "number" || !Number.isSafeInteger(s.timestampMs)) {
      return "malformed-effect-timestampMs";
    }
    if ("actor" in s && typeof s.actor !== "string") {
      return "malformed-effect-actor";
    }
    if (
      s.timestampMs < (rec.windowStartMs as number) ||
      s.timestampMs >= (rec.windowEndMs as number)
    ) {
      return "effect-outside-window";
    }
  }
  return null;
}

export function signEffectExtract(
  body: EffectExtractClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedEffectExtract {
  const shape = effectExtractShapeRefusal(body);
  if (shape !== null) {
    throw new Error(shape);
  }
  const payload = Buffer.from(canonical(body), "utf8");
  const signature = Buffer.from(pemSigner(privateKeyPem, publicKeyPem).sign(payload)).toString(
    "base64",
  );
  return { body, signature, publicKeyPem };
}

export function verifyEffectExtract(
  signed: SignedEffectExtract,
  expectedSignerKeyPem?: string,
): boolean {
  if (effectExtractShapeRefusal(signed.body) !== null) {
    return false;
  }
  if (expectedSignerKeyPem !== undefined && !sameSpkiKey(signed.publicKeyPem, expectedSignerKeyPem)) {
    return false;
  }
  try {
    const payload = Buffer.from(canonical(signed.body), "utf8");
    return verify(null, payload, signed.publicKeyPem, Buffer.from(signed.signature, "base64"));
  } catch {
    return false;
  }
}

export function effectExtractEncodeRefusal(signed: SignedEffectExtract): string | null {
  return effectExtractShapeRefusal(signed.body) ?? jcsEncodeRefusal(signed.body);
}

export function parseEffectExtractJson(text: string): EffectExtractClaims {
  const dup = effectExtractTextRefusal(text);
  if (dup) throw new Error(dup);
  return parseIJson(text) as EffectExtractClaims;
}
