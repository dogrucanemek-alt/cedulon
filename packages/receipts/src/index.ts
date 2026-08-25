import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { canonical } from "@cedulon/core";
import {
  asMap,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  mapGet,
  signCoseSign1,
  verifyCoseSign1,
} from "@cedulon/cose";

/** CWT-style integer labels for Spend Receipt claims (private use). */
export const RECEIPT_CLAIM = {
  payer: 100,
  payee: 101,
  amount: 102,
  currency: 103,
  policyHash: 104,
  manifestHash: 105,
  noManifest: 106,
  x402PaymentRef: 107,
  timestampMs: 108,
  nonce: 109,
  prevReceiptHash: 110,
} as const;

export type ReceiptEncoding = "cose" | "json";

export type SpendReceiptClaims = {
  payer: string;
  payee: string;
  amount: string;
  currency: string;
  policyHash: string;
  manifestHash: string | null;
  noManifest: boolean;
  x402PaymentRef: string | null;
  timestampMs: number;
  nonce: string;
  prevReceiptHash: string | null;
};

export type SignedReceipt = {
  claims: SpendReceiptClaims;
  signature: string;
  publicKeyPem: string;
  encoding: ReceiptEncoding;
  coseHex?: string;
};

export type PrivacyMode = "full" | "public-hash";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function generateReceiptKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function claimsToCbor(claims: SpendReceiptClaims): Uint8Array {
  return encodeCbor(
    cborMap([
      [RECEIPT_CLAIM.payer, claims.payer],
      [RECEIPT_CLAIM.payee, claims.payee],
      [RECEIPT_CLAIM.amount, claims.amount],
      [RECEIPT_CLAIM.currency, claims.currency],
      [RECEIPT_CLAIM.policyHash, claims.policyHash],
      [RECEIPT_CLAIM.manifestHash, claims.manifestHash],
      [RECEIPT_CLAIM.noManifest, claims.noManifest],
      [RECEIPT_CLAIM.x402PaymentRef, claims.x402PaymentRef],
      [RECEIPT_CLAIM.timestampMs, claims.timestampMs],
      [RECEIPT_CLAIM.nonce, claims.nonce],
      [RECEIPT_CLAIM.prevReceiptHash, claims.prevReceiptHash],
    ]),
  );
}

export function claimsFromCbor(bytes: Uint8Array): SpendReceiptClaims {
  const map = asMap(decodeCbor(bytes));
  const text = (key: number): string => {
    const v = mapGet(map, key);
    if (typeof v !== "string") throw new Error("claim-tstr");
    return v;
  };
  const textOrNull = (key: number): string | null => {
    const v = mapGet(map, key);
    if (v === null) return null;
    if (typeof v !== "string") throw new Error("claim-tstr-or-null");
    return v;
  };
  const ts = mapGet(map, RECEIPT_CLAIM.timestampMs);
  const noMan = mapGet(map, RECEIPT_CLAIM.noManifest);
  if (typeof ts !== "number" || typeof noMan !== "boolean") {
    throw new Error("claim-types");
  }
  return {
    payer: text(RECEIPT_CLAIM.payer),
    payee: text(RECEIPT_CLAIM.payee),
    amount: text(RECEIPT_CLAIM.amount),
    currency: text(RECEIPT_CLAIM.currency),
    policyHash: text(RECEIPT_CLAIM.policyHash),
    manifestHash: textOrNull(RECEIPT_CLAIM.manifestHash),
    noManifest: noMan,
    x402PaymentRef: textOrNull(RECEIPT_CLAIM.x402PaymentRef),
    timestampMs: ts,
    nonce: text(RECEIPT_CLAIM.nonce),
    prevReceiptHash: textOrNull(RECEIPT_CLAIM.prevReceiptHash),
  };
}

function assertClaimConsistency(claims: SpendReceiptClaims): void {
  if (claims.noManifest !== (claims.manifestHash === null)) {
    throw new Error("no-manifest flag must match missing manifestHash");
  }
}

export function signReceiptJson(
  claims: SpendReceiptClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedReceipt {
  assertClaimConsistency(claims);
  const payload = Buffer.from(canonical(claims), "utf8");
  const signature = sign(null, payload, privateKeyPem).toString("base64");
  return { claims, signature, publicKeyPem, encoding: "json" };
}

export function verifyReceiptJson(signed: SignedReceipt): boolean {
  if (signed.claims.noManifest !== (signed.claims.manifestHash === null)) {
    return false;
  }
  const payload = Buffer.from(canonical(signed.claims), "utf8");
  try {
    return verify(null, payload, signed.publicKeyPem, Buffer.from(signed.signature, "base64"));
  } catch {
    return false;
  }
}

export function signReceiptCose(
  claims: SpendReceiptClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedReceipt {
  assertClaimConsistency(claims);
  const payload = claimsToCbor(claims);
  const cose = signCoseSign1(payload, privateKeyPem);
  const msg = decodeCoseSign1(cose);
  return {
    claims,
    signature: Buffer.from(msg.signature).toString("base64"),
    publicKeyPem,
    encoding: "cose",
    coseHex: Buffer.from(cose).toString("hex"),
  };
}

export function verifyReceiptCose(signed: SignedReceipt): boolean {
  if (!signed.coseHex) {
    return false;
  }
  if (signed.claims.noManifest !== (signed.claims.manifestHash === null)) {
    return false;
  }
  const bytes = Buffer.from(signed.coseHex, "hex");
  if (!verifyCoseSign1(bytes, signed.publicKeyPem)) {
    return false;
  }
  try {
    const msg = decodeCoseSign1(bytes);
    const decoded = claimsFromCbor(msg.payload);
    return canonical(decoded) === canonical(signed.claims);
  } catch {
    return false;
  }
}

export function signReceipt(
  claims: SpendReceiptClaims,
  privateKeyPem: string,
  publicKeyPem: string,
  encoding: ReceiptEncoding = "cose",
): SignedReceipt {
  return encoding === "json"
    ? signReceiptJson(claims, privateKeyPem, publicKeyPem)
    : signReceiptCose(claims, privateKeyPem, publicKeyPem);
}

export function verifyReceipt(signed: SignedReceipt): boolean {
  return signed.encoding === "json" ? verifyReceiptJson(signed) : verifyReceiptCose(signed);
}

export function receiptHash(signed: SignedReceipt): string {
  if (signed.encoding === "cose" && signed.coseHex) {
    return sha256Hex(Buffer.from(signed.coseHex, "hex"));
  }
  return sha256Hex(canonical({ claims: signed.claims, signature: signed.signature }));
}

export function publicAnchorEncoding(
  signed: SignedReceipt,
  mode: PrivacyMode,
): Record<string, unknown> {
  if (mode === "public-hash") {
    return {
      policyHash: signed.claims.policyHash,
      manifestHash: signed.claims.manifestHash,
      receiptHash: receiptHash(signed),
      timestampMs: signed.claims.timestampMs,
    };
  }
  return { claims: signed.claims };
}

export function assertNoPiiFields(obj: Record<string, unknown>): void {
  const banned = ["pan", "governmentId", "streetAddress"];
  for (const key of Object.keys(obj)) {
    if (banned.includes(key)) {
      throw new Error("pii-field");
    }
  }
}

export type ScittAnchorStub = {
  statementHash: string;
  anchored: false;
  note: "stub-no-transparency-service";
};

export function scittAnchorStub(signed: SignedReceipt): ScittAnchorStub {
  return {
    statementHash: receiptHash(signed),
    anchored: false,
    note: "stub-no-transparency-service",
  };
}

export type DisputeEvidenceBundle = {
  kind: "dispute-evidence";
  manifestCanonical: string;
  receiptCanonical: string;
  deliveryHash: string;
  acceptanceCriteriaHash: string;
  matchesAcceptance: boolean;
};

export function makeDisputeBundle(input: {
  manifestCanonical: string;
  receiptCanonical: string;
  deliveryBytes: Buffer;
  acceptanceCriteriaHash: string;
}): DisputeEvidenceBundle {
  const deliveryHash = sha256Hex(input.deliveryBytes);
  return {
    kind: "dispute-evidence",
    manifestCanonical: input.manifestCanonical,
    receiptCanonical: input.receiptCanonical,
    deliveryHash,
    acceptanceCriteriaHash: input.acceptanceCriteriaHash,
    matchesAcceptance: deliveryHash === input.acceptanceCriteriaHash,
  };
}

export function verifyDisputeBundle(bundle: DisputeEvidenceBundle): boolean {
  return (
    bundle.kind === "dispute-evidence" &&
    bundle.matchesAcceptance ===
      (bundle.deliveryHash === bundle.acceptanceCriteriaHash) &&
    bundle.manifestCanonical.length > 0 &&
    bundle.receiptCanonical.length > 0
  );
}
