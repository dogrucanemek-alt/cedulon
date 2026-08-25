import { createHash, generateKeyPairSync } from "node:crypto";
import {
  CTY_MANIFEST,
  asMap,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  mapGet,
  signCoseSign1,
  verifyCoseSign1,
} from "@cedulon/cose";
import { canonical } from "@cedulon/core";

/** CWT private-use labels for Trade Manifest claims. */
export const MANIFEST_CLAIM = {
  description: -70201,
  amount: -70202,
  currency: -70203,
  acceptanceCriteriaHash: -70204,
  cancelCondition: -70205,
  expiresAtMs: -70206,
  ap2MandateHash: -70207,
} as const;

export type TradeManifestBody = {
  description: string;
  amount: string;
  currency: string;
  acceptanceCriteriaHash: string;
  cancelCondition: string;
  expiresAtMs: number;
  ap2MandateHash?: string | null;
};

export type SignedManifest = {
  body: TradeManifestBody;
  signature: string;
  publicKeyPem: string;
  encoding: "cose";
  coseHex: string;
};

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function generateManifestKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function manifestToCbor(body: TradeManifestBody): Uint8Array {
  return encodeCbor(
    cborMap([
      [MANIFEST_CLAIM.description, body.description],
      [MANIFEST_CLAIM.amount, body.amount],
      [MANIFEST_CLAIM.currency, body.currency],
      [MANIFEST_CLAIM.acceptanceCriteriaHash, body.acceptanceCriteriaHash],
      [MANIFEST_CLAIM.cancelCondition, body.cancelCondition],
      [MANIFEST_CLAIM.expiresAtMs, body.expiresAtMs],
      [MANIFEST_CLAIM.ap2MandateHash, body.ap2MandateHash ?? null],
    ]),
  );
}

export function manifestFromCbor(bytes: Uint8Array): TradeManifestBody {
  const map = asMap(decodeCbor(bytes));
  const text = (key: number): string => {
    const v = mapGet(map, key);
    if (typeof v !== "string") throw new Error("manifest-tstr");
    return v;
  };
  const textOrNull = (key: number): string | null => {
    const v = mapGet(map, key);
    if (v === null) return null;
    if (typeof v !== "string") throw new Error("manifest-tstr-or-null");
    return v;
  };
  const exp = mapGet(map, MANIFEST_CLAIM.expiresAtMs);
  if (typeof exp !== "number") throw new Error("manifest-exp");
  const ap2 = textOrNull(MANIFEST_CLAIM.ap2MandateHash);
  return {
    description: text(MANIFEST_CLAIM.description),
    amount: text(MANIFEST_CLAIM.amount),
    currency: text(MANIFEST_CLAIM.currency),
    acceptanceCriteriaHash: text(MANIFEST_CLAIM.acceptanceCriteriaHash),
    cancelCondition: text(MANIFEST_CLAIM.cancelCondition),
    expiresAtMs: exp,
    ...(ap2 === null ? {} : { ap2MandateHash: ap2 }),
  };
}

export function signManifest(
  body: TradeManifestBody,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedManifest {
  const cose = signCoseSign1(manifestToCbor(body), privateKeyPem, CTY_MANIFEST);
  const msg = decodeCoseSign1(cose);
  return {
    body,
    signature: Buffer.from(msg.signature).toString("base64"),
    publicKeyPem,
    encoding: "cose",
    coseHex: Buffer.from(cose).toString("hex"),
  };
}

export function verifyManifest(signed: SignedManifest): boolean {
  if (!signed.coseHex) {
    return false;
  }
  const bytes = Buffer.from(signed.coseHex, "hex");
  if (!verifyCoseSign1(bytes, signed.publicKeyPem, CTY_MANIFEST)) {
    return false;
  }
  try {
    const msg = decodeCoseSign1(bytes);
    const decoded = manifestFromCbor(msg.payload);
    return canonical(decoded) === canonical(signed.body);
  } catch {
    return false;
  }
}

export function manifestHash(signed: SignedManifest): string {
  return sha256Hex(Buffer.from(signed.coseHex, "hex"));
}

export function isManifestExpired(signed: SignedManifest, nowMs: number): boolean {
  return nowMs > signed.body.expiresAtMs;
}

export function flipCanonicalByte(text: string): string {
  const buf = Buffer.from(text, "utf8");
  buf[0] = buf[0] ^ 0xff;
  return buf.toString("utf8");
}
