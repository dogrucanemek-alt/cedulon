import { createHash, generateKeyPairSync } from "node:crypto";
import {
  CTY_DECISION_RECORD,
  asMap,
  asSigner,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  mapGet,
  signCoseSign1,
  verifyCoseSign1,
  type Signer,
} from "@cedulon/cose";
import { canonical } from "./canonical.ts";
import { hashClaimRefusal } from "./types.ts";

/**
 * CWT private-use labels for a Decision Record.
 * -70401..-70402 are already the countersignature claims
 * (`packages/receipts/src/index.ts:41-43`). This block starts at -70501
 * so the two maps never share a number.
 */
export const DECISION_RECORD_CLAIM = {
  decider: -70501,
  subject: -70502,
  requestHash: -70503,
  policyHash: -70504,
  inputsHash: -70505,
  decision: -70506,
  reasonCode: -70507,
  ref: -70508,
  effectHash: -70509,
  timestampMs: -70510,
  nonce: -70511,
  prevRecordHash: -70512,
} as const;

export type DecisionKind = "allow" | "deny" | "defer";

export type DecisionRecordClaims = {
  decider: string;
  subject: string;
  requestHash: string;
  policyHash: string;
  inputsHash: string | null;
  decision: DecisionKind;
  reasonCode: string;
  /** Counterparty effect row. Required on allow; deny/defer may omit. */
  ref: string | null;
  /** Hash of the effect this decision intends. Required on allow. */
  effectHash: string | null;
  timestampMs: number;
  nonce: string;
  prevRecordHash: string | null;
};

export type SignedDecisionRecord = {
  claims: DecisionRecordClaims;
  publicKeyPem: string;
  encoding: "cose";
  coseHex: string;
};

export function generateDecisionRecordKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function decisionRecordToCbor(claims: DecisionRecordClaims): Uint8Array {
  return encodeCbor(
    cborMap([
      [DECISION_RECORD_CLAIM.decider, claims.decider],
      [DECISION_RECORD_CLAIM.subject, claims.subject],
      [DECISION_RECORD_CLAIM.requestHash, claims.requestHash],
      [DECISION_RECORD_CLAIM.policyHash, claims.policyHash],
      [DECISION_RECORD_CLAIM.inputsHash, claims.inputsHash],
      [DECISION_RECORD_CLAIM.decision, claims.decision],
      [DECISION_RECORD_CLAIM.reasonCode, claims.reasonCode],
      [DECISION_RECORD_CLAIM.ref, claims.ref],
      [DECISION_RECORD_CLAIM.effectHash, claims.effectHash],
      [DECISION_RECORD_CLAIM.timestampMs, claims.timestampMs],
      [DECISION_RECORD_CLAIM.nonce, claims.nonce],
      [DECISION_RECORD_CLAIM.prevRecordHash, claims.prevRecordHash],
    ]),
  );
}

export function decisionRecordFromCbor(bytes: Uint8Array): DecisionRecordClaims {
  const map = asMap(decodeCbor(bytes));
  const text = (key: number): string => {
    const v = mapGet(map, key);
    if (typeof v !== "string") throw new Error("decision-record-tstr");
    return v;
  };
  const textOrNull = (key: number): string | null => {
    const v = mapGet(map, key);
    if (v === null) return null;
    if (typeof v !== "string") throw new Error("decision-record-tstr-or-null");
    return v;
  };
  const ts = mapGet(map, DECISION_RECORD_CLAIM.timestampMs);
  const decision = mapGet(map, DECISION_RECORD_CLAIM.decision);
  if (typeof ts !== "number") throw new Error("decision-record-uint");
  if (decision !== "allow" && decision !== "deny" && decision !== "defer") {
    throw new Error("decision-record-decision");
  }
  return {
    decider: text(DECISION_RECORD_CLAIM.decider),
    subject: text(DECISION_RECORD_CLAIM.subject),
    requestHash: text(DECISION_RECORD_CLAIM.requestHash),
    policyHash: text(DECISION_RECORD_CLAIM.policyHash),
    inputsHash: textOrNull(DECISION_RECORD_CLAIM.inputsHash),
    decision,
    reasonCode: text(DECISION_RECORD_CLAIM.reasonCode),
    ref: textOrNull(DECISION_RECORD_CLAIM.ref),
    effectHash: textOrNull(DECISION_RECORD_CLAIM.effectHash),
    timestampMs: ts,
    nonce: text(DECISION_RECORD_CLAIM.nonce),
    prevRecordHash: textOrNull(DECISION_RECORD_CLAIM.prevRecordHash),
  };
}

function assertDecisionRecordClaims(claims: DecisionRecordClaims): void {
  if (claims.decision !== "allow" && claims.decision !== "deny" && claims.decision !== "defer") {
    throw new Error("decision must be allow, deny, or defer");
  }
  const request = hashClaimRefusal("requestHash", claims.requestHash);
  if (request) throw new Error(request);
  const policy = hashClaimRefusal("policyHash", claims.policyHash);
  if (policy) throw new Error(policy);
  const inputs = hashClaimRefusal("inputsHash", claims.inputsHash, true);
  if (inputs) throw new Error(inputs);
  const effect = hashClaimRefusal("effectHash", claims.effectHash, true);
  if (effect) throw new Error(effect);
  const prev = hashClaimRefusal("prevRecordHash", claims.prevRecordHash, true);
  if (prev) throw new Error(prev);
  if (!Number.isSafeInteger(claims.timestampMs) || claims.timestampMs < 0) {
    // The label table says uint. A CBOR decoder hands back any number.
    throw new Error("decision-record-timestamp");
  }
  if (claims.decision === "allow") {
    if (claims.ref === null || claims.ref === "") {
      throw new Error("allow-requires-ref");
    }
    if (claims.effectHash === null) {
      throw new Error("allow-requires-effect-hash");
    }
  } else if (claims.effectHash !== null) {
    // A refusal binds to the absence of a row, never to a hash. A hash on
    // a deny would be a claim the audit cannot measure and a second
    // reading of "was it sent". The ref may stay: it names what was refused.
    throw new Error("refusal-carries-effect-hash");
  }
}

export function signDecisionRecord(
  claims: DecisionRecordClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedDecisionRecord;
export function signDecisionRecord(claims: DecisionRecordClaims, signer: Signer): SignedDecisionRecord;
export function signDecisionRecord(
  claims: DecisionRecordClaims,
  key: string | Signer,
  publicKeyPem?: string,
): SignedDecisionRecord {
  assertDecisionRecordClaims(claims);
  const signer = asSigner(key, publicKeyPem);
  const cose = signCoseSign1(decisionRecordToCbor(claims), signer, CTY_DECISION_RECORD);
  return {
    claims,
    publicKeyPem: signer.publicKeyPem,
    encoding: "cose",
    coseHex: Buffer.from(cose).toString("hex"),
  };
}

/**
 * `expectedDeciderKeyPem` is the decider key the verifier holds out of band.
 * Given, the signature is checked under that key and the carried key is not
 * consulted: it is an unsigned surface, and whether it matches the pin is
 * the audit's `carried-key-mismatch` question, not this function's (core
 * 6.3, 10.1). Omitted, the carried key is the only key there is.
 */
export function verifyDecisionRecord(
  signed: SignedDecisionRecord,
  expectedDeciderKeyPem?: string,
): boolean {
  const bytes = Buffer.from(signed.coseHex, "hex");
  if (!verifyCoseSign1(bytes, expectedDeciderKeyPem ?? signed.publicKeyPem, CTY_DECISION_RECORD)) {
    return false;
  }
  try {
    const msg = decodeCoseSign1(bytes);
    const decoded = decisionRecordFromCbor(msg.payload);
    // The decider is the party under audit. Its signer applying the claim
    // rules is not evidence that they were applied; a Sign1 over a CBOR
    // map that skips them is byte-for-byte as valid. Re-apply them here,
    // where the verifier is, on the decoded claims.
    assertDecisionRecordClaims(decoded);
    return canonical(decoded) === canonical(signed.claims);
  } catch {
    return false;
  }
}

/**
 * SHA-256 of the COSE Sign1 bytes (`coseHex`), the same bytes
 * `receiptHash` hashes when the receipt encoding is cose
 * (`packages/receipts/src/index.ts:471-473`). Not a hash of a
 * separately canonicalised CBOR claims map.
 */
export function decisionRecordHash(signed: SignedDecisionRecord): string {
  return sha256Hex(Buffer.from(signed.coseHex, "hex"));
}

export type DecisionRecordChainBreak = { index: number; reason: string };

/**
 * `pinPems`, when given, are the decider keys the verifier holds: a record
 * verifies under any of them. Absent, each record is checked against the
 * key it carries.
 */
export function findDecisionRecordChainBreak(
  records: SignedDecisionRecord[],
  pinPems?: readonly string[],
): DecisionRecordChainBreak | null {
  const verifies = (r: SignedDecisionRecord): boolean =>
    pinPems === undefined ? verifyDecisionRecord(r) : pinPems.some((pem) => verifyDecisionRecord(r, pem));
  for (let i = 0; i < records.length; i += 1) {
    if (!verifies(records[i])) {
      return { index: i, reason: "bad-signature" };
    }
    const expectedPrev = i === 0 ? null : decisionRecordHash(records[i - 1]);
    if (records[i].claims.prevRecordHash !== expectedPrev) {
      return { index: i, reason: "broken-link" };
    }
  }
  return null;
}
