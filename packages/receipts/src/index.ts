import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { canonical } from "@cedulon/core";

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

export function signReceipt(
  claims: SpendReceiptClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedReceipt {
  if (claims.noManifest !== (claims.manifestHash === null)) {
    throw new Error("no-manifest flag must match missing manifestHash");
  }
  const payload = Buffer.from(canonical(claims), "utf8");
  const signature = sign(null, payload, privateKeyPem).toString("base64");
  return { claims, signature, publicKeyPem };
}

export function verifyReceipt(signed: SignedReceipt): boolean {
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

export function receiptHash(signed: SignedReceipt): string {
  return sha256Hex(canonical(signed));
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
