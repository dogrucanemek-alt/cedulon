import { createHash } from "node:crypto";
import { canonical, hashClaimRefusal } from "@cedulon/core";
import {
  CTY_CHECKPOINT,
  asMap,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  mapGet,
  asSigner,
  sameSpkiKey,
  signCoseSign1,
  verifyCoseSign1,
  type Signer,
  type CborMap,
  type CborVal,
} from "@cedulon/cose";
import { receiptHash, type SignedReceipt } from "@cedulon/receipts";

export const CHECKPOINT_CLAIM = {
  epoch: -70101,
  startMs: -70102,
  endMs: -70103,
  receiptCount: -70104,
  chainHeadHash: -70105,
  totals: -70106,
  prevCheckpointHash: -70107,
} as const;

export type CheckpointClaims = {
  epoch: number;
  startMs: number;
  endMs: number;
  receiptCount: number;
  chainHeadHash: string | null;
  /**
   * Per-currency settled totals for the window. `null` means the issuer published
   * the checkpoint with its totals withheld. The distinction is inside the signature:
   * an empty object is an honest zero, `null` is a redaction the issuer signed for.
   */
  totals: Record<string, string> | null;
  prevCheckpointHash: string | null;
};

export type SignedCheckpoint = {
  claims: CheckpointClaims;
  publicKeyPem: string;
  encoding: "cose";
  coseHex: string;
};

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function totalsFromReceipts(receipts: SignedReceipt[]): Record<string, string> {
  const acc = new Map<string, bigint>();
  for (const r of receipts) {
    if (r.claims.outcome === "aborted") {
      continue;
    }
    const prev = acc.get(r.claims.currency) ?? 0n;
    acc.set(r.claims.currency, prev + BigInt(r.claims.amount));
  }
  const out: Record<string, string> = {};
  for (const [k, v] of [...acc.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out[k] = v.toString();
  }
  return out;
}

export function buildCheckpointClaims(
  epoch: number,
  receipts: SignedReceipt[],
  startMs: number,
  endMs: number,
  prevCheckpointHash: string | null,
  totalsFn: (records: SignedReceipt[]) => Record<string, string> = totalsFromReceipts,
): CheckpointClaims {
  return {
    epoch,
    startMs,
    endMs,
    receiptCount: receipts.length,
    chainHeadHash: receipts.length === 0 ? null : receiptHash(receipts[receipts.length - 1]),
    totals: totalsFn(receipts),
    prevCheckpointHash,
  };
}

function totalsToCbor(totals: Record<string, string>): CborMap {
  return cborMap(Object.keys(totals).sort().map((k) => [k, totals[k]] as [CborVal, CborVal]));
}

function totalsFromCbor(value: CborVal): Record<string, string> {
  const map = asMap(value);
  const out: Record<string, string> = {};
  for (const [k, v] of map.$map) {
    if (typeof k !== "string" || typeof v !== "string") {
      throw new Error("totals-types");
    }
    out[k] = v;
  }
  return out;
}

export function checkpointToCbor(claims: CheckpointClaims): Uint8Array {
  return encodeCbor(
    cborMap([
      [CHECKPOINT_CLAIM.epoch, claims.epoch],
      [CHECKPOINT_CLAIM.startMs, claims.startMs],
      [CHECKPOINT_CLAIM.endMs, claims.endMs],
      [CHECKPOINT_CLAIM.receiptCount, claims.receiptCount],
      [CHECKPOINT_CLAIM.chainHeadHash, claims.chainHeadHash],
      [CHECKPOINT_CLAIM.totals, claims.totals === null ? null : totalsToCbor(claims.totals)],
      [CHECKPOINT_CLAIM.prevCheckpointHash, claims.prevCheckpointHash],
    ]),
  );
}

export function checkpointFromCbor(bytes: Uint8Array): CheckpointClaims {
  const map = asMap(decodeCbor(bytes));
  const num = (key: number): number => {
    const v = mapGet(map, key);
    if (typeof v !== "number") throw new Error("checkpoint-uint");
    return v;
  };
  const textOrNull = (key: number): string | null => {
    const v = mapGet(map, key);
    if (v === null) return null;
    if (typeof v !== "string") throw new Error("checkpoint-tstr");
    return v;
  };
  const totalsVal = mapGet(map, CHECKPOINT_CLAIM.totals);
  if (totalsVal === undefined) throw new Error("checkpoint-totals");
  return {
    epoch: num(CHECKPOINT_CLAIM.epoch),
    startMs: num(CHECKPOINT_CLAIM.startMs),
    endMs: num(CHECKPOINT_CLAIM.endMs),
    receiptCount: num(CHECKPOINT_CLAIM.receiptCount),
    chainHeadHash: textOrNull(CHECKPOINT_CLAIM.chainHeadHash),
    totals: totalsVal === null ? null : totalsFromCbor(totalsVal),
    prevCheckpointHash: textOrNull(CHECKPOINT_CLAIM.prevCheckpointHash),
  };
}

export function signCheckpoint(
  claims: CheckpointClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedCheckpoint;
export function signCheckpoint(claims: CheckpointClaims, signer: Signer): SignedCheckpoint;
export function signCheckpoint(
  claims: CheckpointClaims,
  key: string | Signer,
  publicKeyPem?: string,
): SignedCheckpoint {
  const signer = asSigner(key, publicKeyPem);
  const head = hashClaimRefusal("chainHeadHash", claims.chainHeadHash, true);
  if (head) throw new Error(head);
  const prev = hashClaimRefusal("prevCheckpointHash", claims.prevCheckpointHash, true);
  if (prev) throw new Error(prev);
  const cose = signCoseSign1(checkpointToCbor(claims), signer, CTY_CHECKPOINT);
  return {
    claims,
    publicKeyPem: signer.publicKeyPem,
    encoding: "cose",
    coseHex: Buffer.from(cose).toString("hex"),
  };
}

/**
 * Publish a checkpoint with its totals withheld. The redaction is part of what
 * gets signed, so it cannot be asserted — or undone — after the fact.
 */
export function redactCheckpointTotals(claims: CheckpointClaims): CheckpointClaims {
  return { ...claims, totals: null };
}

/**
 * `expectedIssuerKeyPem` is the key the verifier holds out of band. Without it
 * the checkpoint is checked against the key it carries, which proves internal
 * consistency and nothing about who published the epoch.
 */
export function verifyCheckpoint(signed: SignedCheckpoint, expectedIssuerKeyPem?: string): boolean {
  if (expectedIssuerKeyPem !== undefined && !sameSpkiKey(signed.publicKeyPem, expectedIssuerKeyPem)) {
    return false;
  }
  const bytes = Buffer.from(signed.coseHex, "hex");
  if (!verifyCoseSign1(bytes, signed.publicKeyPem, CTY_CHECKPOINT)) {
    return false;
  }
  try {
    const msg = decodeCoseSign1(bytes);
    const decoded = checkpointFromCbor(msg.payload);
    return canonical(decoded) === canonical(signed.claims);
  } catch {
    return false;
  }
}

/** Signature under this pin, ignoring the carried PEM. Same question as receipts. */
export function verifyCheckpointUnderPin(signed: SignedCheckpoint, pinPem: string): boolean {
  const bytes = Buffer.from(signed.coseHex, "hex");
  if (!verifyCoseSign1(bytes, pinPem, CTY_CHECKPOINT)) {
    return false;
  }
  try {
    const msg = decodeCoseSign1(bytes);
    const decoded = checkpointFromCbor(msg.payload);
    return canonical(decoded) === canonical(signed.claims);
  } catch {
    return false;
  }
}

export function checkpointHash(signed: SignedCheckpoint): string {
  return sha256Hex(Buffer.from(signed.coseHex, "hex"));
}

export type ChainBreak = { index: number; reason: string };

export function findCheckpointChainBreak(
  chain: SignedCheckpoint[],
  expectedIssuerKeyPem?: string,
): ChainBreak | null {
  for (let i = 0; i < chain.length; i += 1) {
    if (!verifyCheckpoint(chain[i], expectedIssuerKeyPem)) {
      return { index: i, reason: "bad-signature" };
    }
    const expectedPrev = i === 0 ? null : checkpointHash(chain[i - 1]);
    if (chain[i].claims.prevCheckpointHash !== expectedPrev) {
      return { index: i, reason: "broken-link" };
    }
  }
  return null;
}

export type Equivocation = { epoch: number; hashes: string[] };

/**
 * `expectedIssuerKeyPem` names whose epochs these are. Two issuers signing one
 * epoch number is not one issuer equivocating, and without the key this cannot
 * tell those apart.
 */
export function findEquivocation(
  checkpoints: SignedCheckpoint[],
  expectedIssuerKeyPem?: string,
): Equivocation | null {
  const byEpoch = new Map<number, Set<string>>();
  for (const cp of checkpoints) {
    if (!verifyCheckpoint(cp, expectedIssuerKeyPem)) {
      continue;
    }
    const h = checkpointHash(cp);
    const set = byEpoch.get(cp.claims.epoch) ?? new Set<string>();
    set.add(h);
    byEpoch.set(cp.claims.epoch, set);
  }
  for (const [epoch, hashes] of byEpoch) {
    if (hashes.size > 1) {
      return { epoch, hashes: [...hashes].sort() };
    }
  }
  return null;
}
