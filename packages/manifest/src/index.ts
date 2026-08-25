import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { canonical } from "@cedulon/core";

export type TradeManifestBody = {
  description: string;
  amount: string;
  currency: string;
  acceptanceCriteriaHash: string;
  cancelCondition: string;
  expiresAtMs: number;
  ap2MandateHash?: string;
};

export type SignedManifest = {
  body: TradeManifestBody;
  signature: string;
  publicKeyPem: string;
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

export function signManifest(
  body: TradeManifestBody,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedManifest {
  const payload = Buffer.from(canonical(body), "utf8");
  const signature = sign(null, payload, privateKeyPem).toString("base64");
  return { body, signature, publicKeyPem };
}

export function verifyManifest(signed: SignedManifest): boolean {
  const payload = Buffer.from(canonical(signed.body), "utf8");
  try {
    return verify(null, payload, signed.publicKeyPem, Buffer.from(signed.signature, "base64"));
  } catch {
    return false;
  }
}

export function manifestHash(signed: SignedManifest): string {
  return sha256Hex(canonical(signed));
}

export function isManifestExpired(signed: SignedManifest, nowMs: number): boolean {
  return nowMs > signed.body.expiresAtMs;
}

export function flipCanonicalByte(text: string): string {
  const buf = Buffer.from(text, "utf8");
  buf[0] = buf[0] ^ 0xff;
  return buf.toString("utf8");
}
