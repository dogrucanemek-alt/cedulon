import { createHash } from "node:crypto";
import {
  CTY_DECISION,
  asMap,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  mapGet,
  signCoseSign1,
  verifyCoseSign1,
} from "@cedulon/cose";
import { canonical } from "./canonical.ts";
import { policyDocument, requestHashOf } from "./policy.ts";
import type { Policy, SpendRequest } from "./types.ts";

/** CWT private-use labels for the Decision Token. */
export const DECISION_CLAIM = {
  requestHash: -70301,
  policyHash: -70302,
  expiryMs: -70303,
  nonce: -70304,
  singleUseId: -70305,
} as const;

export type DecisionTokenClaims = {
  requestHash: string;
  policyHash: string;
  expiryMs: number;
  nonce: string;
  singleUseId: string;
};

export type SignedDecisionToken = {
  claims: DecisionTokenClaims;
  publicKeyPem: string;
  encoding: "cose";
  coseHex: string;
};

export function decisionTokenToCbor(claims: DecisionTokenClaims): Uint8Array {
  return encodeCbor(
    cborMap([
      [DECISION_CLAIM.requestHash, claims.requestHash],
      [DECISION_CLAIM.policyHash, claims.policyHash],
      [DECISION_CLAIM.expiryMs, claims.expiryMs],
      [DECISION_CLAIM.nonce, claims.nonce],
      [DECISION_CLAIM.singleUseId, claims.singleUseId],
    ]),
  );
}

export function decisionTokenFromCbor(bytes: Uint8Array): DecisionTokenClaims {
  const map = asMap(decodeCbor(bytes));
  const text = (key: number): string => {
    const v = mapGet(map, key);
    if (typeof v !== "string") throw new Error("decision-tstr");
    return v;
  };
  const exp = mapGet(map, DECISION_CLAIM.expiryMs);
  if (typeof exp !== "number") throw new Error("decision-exp");
  return {
    requestHash: text(DECISION_CLAIM.requestHash),
    policyHash: text(DECISION_CLAIM.policyHash),
    expiryMs: exp,
    nonce: text(DECISION_CLAIM.nonce),
    singleUseId: text(DECISION_CLAIM.singleUseId),
  };
}

export function signDecisionToken(
  claims: DecisionTokenClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedDecisionToken {
  const cose = signCoseSign1(decisionTokenToCbor(claims), privateKeyPem, CTY_DECISION);
  return {
    claims,
    publicKeyPem,
    encoding: "cose",
    coseHex: Buffer.from(cose).toString("hex"),
  };
}

export function verifyDecisionToken(signed: SignedDecisionToken, nowMs?: number): boolean {
  const bytes = Buffer.from(signed.coseHex, "hex");
  if (!verifyCoseSign1(bytes, signed.publicKeyPem, CTY_DECISION)) {
    return false;
  }
  try {
    const msg = decodeCoseSign1(bytes);
    const decoded = decisionTokenFromCbor(msg.payload);
    if (canonical(decoded) !== canonical(signed.claims)) {
      return false;
    }
    if (nowMs !== undefined && signed.claims.expiryMs < nowMs) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function issueDecisionToken(
  req: SpendRequest,
  policy: Policy,
  singleUseId: string,
  expiryMs: number,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedDecisionToken {
  return signDecisionToken(
    {
      requestHash: requestHashOf(req),
      policyHash: createHash("sha256").update(canonical(policyDocument(policy))).digest("hex"),
      expiryMs,
      nonce: req.nonce,
      singleUseId,
    },
    privateKeyPem,
    publicKeyPem,
  );
}
