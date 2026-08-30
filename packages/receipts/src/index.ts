import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { AMOUNT_RE, canonical, hashClaimRefusal, isValidHashText, jcsEncodeRefusal } from "@cedulon/core";
import {
  CTY_COUNTERSIGN,
  CTY_RECEIPT,
  asMap,
  asSigner,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  mapGet,
  sameSpkiKey,
  signCoseSign1,
  verifyCoseSign1,
  type Signer,
} from "@cedulon/cose";

export { pemSigner, type Signer } from "@cedulon/cose";

export type ReceiptOutcome = "settled" | "aborted";

/** CWT private-use labels (less than -65536) for Spend Receipt claims. */
export const RECEIPT_CLAIM = {
  payer: -70001,
  payee: -70002,
  amount: -70003,
  currency: -70004,
  policyHash: -70005,
  manifestHash: -70006,
  noManifest: -70007,
  x402PaymentRef: -70008,
  timestampMs: -70009,
  nonce: -70010,
  prevReceiptHash: -70011,
  outcome: -70012,
} as const;

/** CWT private-use label for a detached payee countersignature payload. */
export const COUNTERSIGN_CLAIM = {
  receiptCose: -70401,
} as const;

// The grammar lives in @cedulon/core so every boundary checks one spelling
// of the rule; re-exported here to keep this package's surface unchanged.
export { AMOUNT_RE, hashClaimRefusal, isValidHashText };
export const NONCE_MIN_BYTES = 16;

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
  outcome: ReceiptOutcome;
};

export type SignedReceipt = {
  claims: SpendReceiptClaims;
  signature: string;
  publicKeyPem: string;
  encoding: ReceiptEncoding;
  coseHex?: string;
  counterCoseHex?: string;
  payeePublicKeyPem?: string;
};

export type PrivacyMode = "full" | "public-hash";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function isValidAmount(amount: string): boolean {
  return AMOUNT_RE.test(amount);
}

export function isValidNonce(nonce: string): boolean {
  return Buffer.byteLength(nonce, "utf8") >= NONCE_MIN_BYTES;
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
      [RECEIPT_CLAIM.outcome, claims.outcome],
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
  const outcome = mapGet(map, RECEIPT_CLAIM.outcome);
  if (typeof ts !== "number" || typeof noMan !== "boolean") {
    throw new Error("claim-types");
  }
  if (outcome !== "settled" && outcome !== "aborted") {
    throw new Error("claim-outcome");
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
    outcome,
  };
}

function assertClaimConsistency(claims: SpendReceiptClaims): void {
  if (claims.noManifest !== (claims.manifestHash === null)) {
    throw new Error("noManifest flag must match missing manifestHash");
  }
  if (claims.outcome !== "settled" && claims.outcome !== "aborted") {
    throw new Error("outcome must be settled or aborted");
  }
  if (claims.outcome === "settled" && claims.x402PaymentRef === null) {
    throw new Error("settled receipt requires rail ref");
  }
  if (!isValidAmount(claims.amount)) {
    throw new Error("amount grammar");
  }
  if (!isValidNonce(claims.nonce)) {
    throw new Error("nonce-too-short");
  }
  const policy = hashClaimRefusal("policyHash", claims.policyHash);
  if (policy) throw new Error(policy);
  const manifest = hashClaimRefusal("manifestHash", claims.manifestHash, true);
  if (manifest) throw new Error(manifest);
  const prev = hashClaimRefusal("prevReceiptHash", claims.prevReceiptHash, true);
  if (prev) throw new Error(prev);
}

export function signReceiptJson(
  claims: SpendReceiptClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedReceipt;
export function signReceiptJson(claims: SpendReceiptClaims, signer: Signer): SignedReceipt;
export function signReceiptJson(
  claims: SpendReceiptClaims,
  key: string | Signer,
  publicKeyPem?: string,
): SignedReceipt {
  const signer = asSigner(key, publicKeyPem);
  assertClaimConsistency(claims);
  const payload = Buffer.from(canonical(claims), "utf8");
  const signature = Buffer.from(signer.sign(payload)).toString("base64");
  return { claims, signature, publicKeyPem: signer.publicKeyPem, encoding: "json" };
}

/** Why encoding this receipt's claims would refuse, or null when it would not. */
export function receiptEncodeRefusal(signed: SignedReceipt): string | null {
  return jcsEncodeRefusal(signed.claims);
}

export function verifyReceiptJson(signed: SignedReceipt, expectedIssuerKeyPem?: string): boolean {
  if (expectedIssuerKeyPem !== undefined && !sameSpkiKey(signed.publicKeyPem, expectedIssuerKeyPem)) {
    return false;
  }
  if (signed.claims.noManifest !== (signed.claims.manifestHash === null)) {
    return false;
  }
  try {
    // Same reason the COSE sibling encodes inside its try: a claim set
    // carrying a value RFC 8785 cannot encode is unverifiable, and this
    // function's contract is to say so rather than to throw.
    const payload = Buffer.from(canonical(signed.claims), "utf8");
    return verify(null, payload, signed.publicKeyPem, Buffer.from(signed.signature, "base64"));
  } catch {
    return false;
  }
}

export function signReceiptCose(
  claims: SpendReceiptClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedReceipt;
export function signReceiptCose(claims: SpendReceiptClaims, signer: Signer): SignedReceipt;
export function signReceiptCose(
  claims: SpendReceiptClaims,
  key: string | Signer,
  publicKeyPem?: string,
): SignedReceipt {
  const signer = asSigner(key, publicKeyPem);
  assertClaimConsistency(claims);
  const payload = claimsToCbor(claims);
  const cose = signCoseSign1(payload, signer, CTY_RECEIPT);
  const msg = decodeCoseSign1(cose);
  return {
    claims,
    signature: Buffer.from(msg.signature).toString("base64"),
    publicKeyPem: signer.publicKeyPem,
    encoding: "cose",
    coseHex: Buffer.from(cose).toString("hex"),
  };
}

export function verifyReceiptCose(signed: SignedReceipt, expectedIssuerKeyPem?: string): boolean {
  if (expectedIssuerKeyPem !== undefined && !sameSpkiKey(signed.publicKeyPem, expectedIssuerKeyPem)) {
    return false;
  }
  if (!signed.coseHex) {
    return false;
  }
  if (signed.claims.noManifest !== (signed.claims.manifestHash === null)) {
    return false;
  }
  const bytes = Buffer.from(signed.coseHex, "hex");
  if (!verifyCoseSign1(bytes, signed.publicKeyPem, CTY_RECEIPT)) {
    return false;
  }
  try {
    const msg = decodeCoseSign1(bytes);
    const decoded = claimsFromCbor(msg.payload);
    return canonical(decoded) === canonical(signed.claims);
  } catch {
    // Anything unreadable is unverified, which is fail-closed on its own.
    // A caller that wants to say why asks coseDecodeRefusalHex; see the note
    // on that function for why this no longer rethrows.
    return false;
  }
}

export function signReceipt(
  claims: SpendReceiptClaims,
  privateKeyPem: string,
  publicKeyPem: string,
  encoding?: ReceiptEncoding,
): SignedReceipt;
export function signReceipt(
  claims: SpendReceiptClaims,
  signer: Signer,
  encoding?: ReceiptEncoding,
): SignedReceipt;
export function signReceipt(
  claims: SpendReceiptClaims,
  key: string | Signer,
  publicKeyOrEncoding?: string,
  encoding: ReceiptEncoding = "cose",
): SignedReceipt {
  if (typeof key === "string") {
    return encoding === "json"
      ? signReceiptJson(claims, key, publicKeyOrEncoding as string)
      : signReceiptCose(claims, key, publicKeyOrEncoding as string);
  }
  const enc =
    publicKeyOrEncoding === "json" || publicKeyOrEncoding === "cose"
      ? publicKeyOrEncoding
      : "cose";
  return enc === "json" ? signReceiptJson(claims, key) : signReceiptCose(claims, key);
}

/** Adversary/test helper: signs claims that an issuer MUST reject. */
export function signReceiptUnchecked(
  claims: SpendReceiptClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedReceipt;
export function signReceiptUnchecked(claims: SpendReceiptClaims, signer: Signer): SignedReceipt;
export function signReceiptUnchecked(
  claims: SpendReceiptClaims,
  key: string | Signer,
  publicKeyPem?: string,
): SignedReceipt {
  const signer = asSigner(key, publicKeyPem);
  const payload = claimsToCbor(claims);
  const cose = signCoseSign1(payload, signer, CTY_RECEIPT);
  const msg = decodeCoseSign1(cose);
  return {
    claims,
    signature: Buffer.from(msg.signature).toString("base64"),
    publicKeyPem: signer.publicKeyPem,
    encoding: "cose",
    coseHex: Buffer.from(cose).toString("hex"),
  };
}

/**
 * Verifying against `signed.publicKeyPem` alone proves the receipt is internally
 * consistent: any key can sign any body, including its own. Pass the issuer key
 * the verifier holds out of band to ask the question that matters - whether this
 * issuer signed it. The parameter is optional so existing callers keep their
 * behaviour; an audit that omits it is told so in its report.
 */
export function verifyReceipt(signed: SignedReceipt, expectedIssuerKeyPem?: string): boolean {
  return signed.encoding === "json"
    ? verifyReceiptJson(signed, expectedIssuerKeyPem)
    : verifyReceiptCose(signed, expectedIssuerKeyPem);
}

function issuerCoseBytes(signed: SignedReceipt): Uint8Array {
  if (!signed.coseHex) {
    throw new Error("countersign-requires-cose");
  }
  return new Uint8Array(Buffer.from(signed.coseHex, "hex"));
}

/**
 * `expectedIssuerKeyPem` is the issuer key the payee holds. Without it this
 * checks the receipt against the key it travels with, which is not the question
 * a payee answers by putting their name on it.
 */
export function counterSign(
  signed: SignedReceipt,
  payeePrivateKeyPem: string,
  payeePublicKeyPem: string,
  expectedIssuerKeyPem?: string,
): SignedReceipt {
  if (!verifyReceipt(signed, expectedIssuerKeyPem)) {
    throw new Error("countersign-unsigned-receipt");
  }
  const payload = encodeCbor(cborMap([[COUNTERSIGN_CLAIM.receiptCose, issuerCoseBytes(signed)]]));
  const cose = signCoseSign1(payload, payeePrivateKeyPem, CTY_COUNTERSIGN);
  return {
    ...signed,
    counterCoseHex: Buffer.from(cose).toString("hex"),
    payeePublicKeyPem,
  };
}

export function verifyCounterSignature(signed: SignedReceipt, payeePublicKeyPem?: string): boolean {
  if (!signed.counterCoseHex) {
    return false;
  }
  const key = payeePublicKeyPem ?? signed.payeePublicKeyPem;
  if (!key || !signed.coseHex) {
    return false;
  }
  try {
    const bytes = Buffer.from(signed.counterCoseHex, "hex");
    if (!verifyCoseSign1(bytes, key, CTY_COUNTERSIGN)) {
      return false;
    }
    const msg = decodeCoseSign1(bytes);
    const map = asMap(decodeCbor(msg.payload));
    const bound = mapGet(map, COUNTERSIGN_CLAIM.receiptCose);
    if (!(bound instanceof Uint8Array)) {
      return false;
    }
    const issuer = issuerCoseBytes(signed);
    if (bound.length !== issuer.length) {
      return false;
    }
    let d = 0;
    for (let i = 0; i < bound.length; i += 1) {
      d |= bound[i] ^ issuer[i];
    }
    return d === 0;
  } catch {
    return false;
  }
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
