import { createHash } from "node:crypto";
import {
  CTY_INCLUSION,
  asMap,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  mapGet,
  sameSpkiKey,
  signCoseSign1,
  verifyCoseSign1,
} from "@cedulon/cose";
import { receiptHash, type SignedReceipt } from "@cedulon/receipts";
import { checkpointHash, type SignedCheckpoint } from "./checkpoint.ts";

/**
 * Inclusion proof: sibling hashes plus the leaf index.
 *
 * New receipts use RFC 9162 Section 2.1 (leaf 0x00 / node 0x01) and
 * carry `alg` / `treeSize`. The legacy helpers `merkleParent`,
 * `padEven`, `merkleRoot`, and `applyInclusionProof` remain only to
 * verify receipts that omit `alg`.
 */
export type InclusionProof = {
  leafIndex: number;
  siblings: string[];
  /** Present on RFC 9162 proofs; required to verify them. */
  treeSize?: number;
  /** Discriminator. Absent ⇒ legacy (domain-separation-free) tree. */
  alg?: "rfc9162-sha256";
};

export type InclusionReceipt = {
  statementHash: string;
  index: number;
  treeHead: string;
  issuerPublicKeyPem: string;
  coseHex: string;
  /** Statement body when the caller still holds it. Not part of the inclusion COSE. */
  checkpoint?: SignedCheckpoint;
  /** Merkle audit path. Absent on receipts issued before the tree upgrade. */
  inclusionProof?: InclusionProof;
  /**
   * RFC 9162 leaf hash: SHA-256(0x00 ‖ statement). Distinct from
   * `statementHash` (SHA-256(statement)), whose meaning is unchanged.
   * Not inside the log-signed payload; computed and compared when present.
   */
  leafHash?: string;
  /**
   * Discriminator. Absent ⇒ legacy (-00) three-entry signed payload.
   * On RFC receipts this equals signed payload label 5.
   */
  alg?: "rfc9162-sha256";
  /**
   * Tree size at issuance. Required when `alg` is `rfc9162-sha256`.
   * On RFC receipts this equals signed payload label 4.
   */
  treeSize?: number;
};

/** Pass/fail plus a flag when the legacy (pre-RFC 9162) walk was used. */
export type InclusionVerifyResult = {
  ok: boolean;
  legacyTree: boolean;
};

const RFC9162_ALG = "rfc9162-sha256" as const;

function sha256Bytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hex32(hex: string): Buffer {
  if (!HASH_HEX_RE.test(hex)) {
    throw new Error("hash-hex");
  }
  return Buffer.from(hex, "hex");
}

/** Interior node: H(left ‖ right) over the 32-byte hashes. */
export function merkleParent(leftHex: string, rightHex: string): string {
  return sha256Bytes(Buffer.concat([hex32(leftHex), hex32(rightHex)]));
}

function padEven(level: string[]): string[] {
  return level.length % 2 === 1 ? [...level, level[level.length - 1]] : level;
}

/** Merkle root of statement-hash leaves. Empty log is 32 zero bytes as hex. */
export function merkleRoot(leaves: readonly string[]): string {
  if (leaves.length === 0) {
    return "0".repeat(64);
  }
  let level = [...leaves];
  while (level.length > 1) {
    const padded = padEven(level);
    const next: string[] = [];
    for (let i = 0; i < padded.length; i += 2) {
      next.push(merkleParent(padded[i], padded[i + 1]));
    }
    level = next;
  }
  return level[0];
}

export function buildInclusionProof(leaves: readonly string[], leafIndex: number): InclusionProof {
  const siblings: string[] = [];
  let level = [...leaves];
  let idx = leafIndex;
  while (level.length > 1) {
    const padded = padEven(level);
    const sib = idx % 2 === 0 ? padded[idx + 1] : padded[idx - 1];
    siblings.push(sib);
    idx = Math.floor(idx / 2);
    const next: string[] = [];
    for (let i = 0; i < padded.length; i += 2) {
      next.push(merkleParent(padded[i], padded[i + 1]));
    }
    level = next;
  }
  return { leafIndex, siblings };
}

const LOWER_HEX_RE = /^(?:[0-9a-f]{2})+$/;
const HASH_HEX_RE = /^[0-9a-f]{64}$/;

/** SHA-256 of the empty string: the RFC 9162 §2.1.1 empty-list MTH. */
export const RFC9162_EMPTY_ROOT =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** Largest power of two strictly smaller than n (n > 1). */
function largestPowerOf2LessThan(n: number): number {
  let k = 1;
  while (k * 2 < n) {
    k *= 2;
  }
  return k;
}

/** RFC 9162 §2.1.1 leaf: HASH(0x00 ‖ entry). */
export function rfc9162LeafHash(entry: Uint8Array): string {
  return sha256Bytes(Buffer.concat([Buffer.from([0x00]), Buffer.from(entry)]));
}

/** RFC 9162 §2.1.1 node: HASH(0x01 ‖ left ‖ right) over 32-byte digests. */
export function rfc9162NodeHash(leftHex: string, rightHex: string): string {
  return sha256Bytes(Buffer.concat([Buffer.from([0x01]), hex32(leftHex), hex32(rightHex)]));
}

/**
 * Merkle tree hash over precomputed leaf hashes (each already HASH(0x00 ‖ entry)).
 * Empty list → HASH(); single leaf → that leaf hash; else split at largest 2^k < n.
 */
export function rfc9162Root(leafHashes: string[]): string {
  const n = leafHashes.length;
  if (n === 0) {
    return sha256Bytes(new Uint8Array());
  }
  if (n === 1) {
    if (!HASH_HEX_RE.test(leafHashes[0]!)) {
      throw new Error("hash-hex");
    }
    return leafHashes[0]!;
  }
  const k = largestPowerOf2LessThan(n);
  return rfc9162NodeHash(rfc9162Root(leafHashes.slice(0, k)), rfc9162Root(leafHashes.slice(k)));
}

function rfc9162Path(leafHashes: readonly string[], m: number): string[] {
  const n = leafHashes.length;
  if (n === 1) {
    return [];
  }
  const k = largestPowerOf2LessThan(n);
  if (m < k) {
    return [...rfc9162Path(leafHashes.slice(0, k), m), rfc9162Root(leafHashes.slice(k) as string[])];
  }
  return [...rfc9162Path(leafHashes.slice(k), m - k), rfc9162Root(leafHashes.slice(0, k) as string[])];
}

/** RFC 9162 §2.1.3.1 inclusion path. */
export function rfc9162InclusionProof(
  leafHashes: string[],
  index: number,
): InclusionProof & { treeSize: number; alg: "rfc9162-sha256" } {
  if (!Number.isSafeInteger(index) || index < 0 || index >= leafHashes.length) {
    throw new Error("inclusion-index");
  }
  return {
    leafIndex: index,
    treeSize: leafHashes.length,
    siblings: rfc9162Path(leafHashes, index),
    alg: RFC9162_ALG,
  };
}

/** Structural PATH length for (treeSize, leafIndex) under RFC 9162 §2.1.3.1. */
function rfc9162PathLength(treeSize: number, leafIndex: number): number {
  let n = treeSize;
  let m = leafIndex;
  let len = 0;
  while (n > 1) {
    const k = largestPowerOf2LessThan(n);
    len += 1;
    if (m < k) {
      n = k;
    } else {
      m -= k;
      n -= k;
    }
  }
  return len;
}

/**
 * RFC 9162 §2.1.3.2. `treeSize` is required; a siblings length that cannot
 * reduce `sn` to 0 yields false. Sibling count must also match the PATH
 * length implied by (treeSize, leafIndex), so treeSize±1 cannot slip through
 * when the hashes happen to coincide.
 */
export function rfc9162VerifyInclusion(
  leafHash: string,
  proof: InclusionProof,
  root: string,
): boolean {
  if (proof.alg !== RFC9162_ALG) {
    return false;
  }
  if (typeof leafHash !== "string" || !HASH_HEX_RE.test(leafHash)) {
    return false;
  }
  if (typeof root !== "string" || !HASH_HEX_RE.test(root)) {
    return false;
  }
  const treeSize = proof.treeSize;
  if (typeof treeSize !== "number" || !Number.isSafeInteger(treeSize) || treeSize < 1) {
    return false;
  }
  if (treeSize > 0xffffffff) {
    return false;
  }
  const { leafIndex, siblings } = proof;
  if (typeof leafIndex !== "number" || !Number.isSafeInteger(leafIndex) || leafIndex < 0) {
    return false;
  }
  if (leafIndex >= treeSize) {
    return false;
  }
  if (!Array.isArray(siblings)) {
    return false;
  }
  for (let i = 0; i < siblings.length; i += 1) {
    const s: unknown = siblings[i];
    if (typeof s !== "string" || !HASH_HEX_RE.test(s)) {
      return false;
    }
  }
  if (siblings.length !== rfc9162PathLength(treeSize, leafIndex)) {
    return false;
  }

  let fn = leafIndex;
  let sn = treeSize - 1;
  let r = leafHash;
  for (const p of siblings) {
    if (sn === 0) {
      return false;
    }
    if ((fn & 1) === 1 || fn === sn) {
      r = rfc9162NodeHash(p, r);
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) {
          fn >>>= 1;
          sn >>>= 1;
        }
      }
    } else {
      r = rfc9162NodeHash(r, p);
    }
    fn >>>= 1;
    sn >>>= 1;
  }
  return sn === 0 && r === root;
}

/**
 * Hex the way this package writes it: lowercase, even length, at least one
 * byte, and nothing else in the string. `Buffer.from(hex, "hex")` stops at
 * the first character it cannot read and returns what it decoded so far, so
 * "aazz" hashed like "aa" and a receipt with a trailing suffix verified as
 * the receipt without it. Anything the regex refuses is not bytes.
 */
export function strictHexBytes(hex: unknown): Buffer | null {
  if (typeof hex !== "string" || !LOWER_HEX_RE.test(hex)) {
    return null;
  }
  return Buffer.from(hex, "hex");
}

/**
 * The proof shape the tree walk is defined over: a non-negative safe
 * integer leaf index and 32-byte sibling hashes, one per level, with the
 * index resolving to the root when the path ends. An empty path at index 1
 * returns the leaf unchanged, so leaf == treeHead would pass a verifier
 * that only compares; the last condition is what refuses it. The path's
 * length is not capped: a safe integer index resolves under any path of 53
 * levels or more, and the walk is one hash per level either way.
 *
 * RFC 9162 proofs carry `alg` and `treeSize`; their sibling count is not
 * tied to `2 ** siblings.length` the way the legacy pad-even walk is.
 */
export function validInclusionProof(proof: unknown): proof is InclusionProof {
  if (typeof proof !== "object" || proof === null) {
    return false;
  }
  const { leafIndex, siblings, alg, treeSize } = proof as {
    leafIndex?: unknown;
    siblings?: unknown;
    alg?: unknown;
    treeSize?: unknown;
  };
  if (typeof leafIndex !== "number" || !Number.isSafeInteger(leafIndex) || leafIndex < 0) {
    return false;
  }
  if (!Array.isArray(siblings)) {
    return false;
  }
  // By index, not Array.prototype.every: every skips holes, and a sparse
  // array with one filled slot passed the shape while the walk met undefined.
  for (let i = 0; i < siblings.length; i += 1) {
    const s: unknown = siblings[i];
    if (typeof s !== "string" || !HASH_HEX_RE.test(s)) {
      return false;
    }
  }
  if (alg === RFC9162_ALG) {
    if (typeof treeSize !== "number" || !Number.isSafeInteger(treeSize) || treeSize < 1) {
      return false;
    }
    if (treeSize > 0xffffffff) {
      return false;
    }
    return leafIndex < treeSize;
  }
  if (alg !== undefined) {
    return false;
  }
  return leafIndex < 2 ** siblings.length;
}

export function applyInclusionProof(leafHash: string, proof: InclusionProof): string {
  if (typeof leafHash !== "string" || !HASH_HEX_RE.test(leafHash) || !validInclusionProof(proof)) {
    throw new Error("inclusion-proof");
  }
  if (proof.alg === RFC9162_ALG) {
    throw new Error("inclusion-proof");
  }
  let hash = leafHash;
  let idx = proof.leafIndex;
  for (const sibling of proof.siblings) {
    hash = idx % 2 === 0 ? merkleParent(hash, sibling) : merkleParent(sibling, hash);
    idx = Math.floor(idx / 2);
  }
  return hash;
}

/** In-process append-only log. No network. SCITT/RFC 9943 spirit, not SCRAPI. */
export class MemoryTransparencyService {
  /** RFC 9162 leaf hashes (HASH(0x00 ‖ statement)). */
  private readonly leaves: string[] = [];
  private treeHead = RFC9162_EMPTY_ROOT;
  readonly publicKeyPem: string;
  private readonly privateKeyPem: string;

  constructor(keys: { publicKeyPem: string; privateKeyPem: string }) {
    this.publicKeyPem = keys.publicKeyPem;
    this.privateKeyPem = keys.privateKeyPem;
  }

  register(statementHex: string): InclusionReceipt {
    const statement = strictHexBytes(statementHex);
    if (!statement) {
      throw new Error("statement-hex");
    }
    const statementHash = createHash("sha256").update(statement).digest("hex");
    const leafHash = rfc9162LeafHash(statement);
    const index = this.leaves.length;
    this.leaves.push(leafHash);
    this.treeHead = rfc9162Root(this.leaves);
    const inclusionProof = rfc9162InclusionProof(this.leaves, index);
    const treeSize = this.leaves.length;
    const payload = encodeCbor(
      cborMap([
        [1, statementHash],
        [2, index],
        [3, this.treeHead],
        [4, treeSize],
        [5, RFC9162_ALG],
      ]),
    );
    const cose = signCoseSign1(payload, this.privateKeyPem, CTY_INCLUSION);
    return {
      statementHash,
      leafHash,
      index,
      treeHead: this.treeHead,
      treeSize,
      alg: RFC9162_ALG,
      issuerPublicKeyPem: this.publicKeyPem,
      coseHex: Buffer.from(cose).toString("hex"),
      inclusionProof,
    };
  }

  /** The log answering about its own receipt: checked against this log's key. */
  verifyInclusion(receipt: InclusionReceipt, candidateStatementHex: string): boolean {
    return this.verifyInclusionDetailed(receipt, candidateStatementHex).ok;
  }

  /**
   * Same checks as `verifyInclusion`, with an explicit `legacyTree` flag when
   * the pre-RFC 9162 walk was selected.
   */
  verifyInclusionDetailed(
    receipt: InclusionReceipt,
    candidateStatementHex: string,
  ): InclusionVerifyResult {
    let signed: ReturnType<typeof decodeInclusionPayload> | undefined;
    try {
      signed = decodeInclusionPayload(receipt.coseHex);
    } catch {
      signed = undefined;
    }
    const legacyTree = signed !== undefined && signed.alg === undefined;
    const stored = this.leaves[receipt.index];
    if (stored === undefined) {
      return { ok: false, legacyTree: signed === undefined ? false : legacyTree };
    }
    if (signed?.alg === RFC9162_ALG) {
      if (receipt.leafHash !== stored) {
        return { ok: false, legacyTree: false };
      }
    } else if (signed?.alg !== undefined) {
      return { ok: false, legacyTree: false };
    } else if (signed !== undefined && stored !== receipt.statementHash) {
      // Legacy receipt against an RFC log: leaf slots hold domain-separated
      // hashes, so a bare statementHash never matches. Still mark legacy.
      return { ok: false, legacyTree: true };
    } else if (signed === undefined) {
      return { ok: false, legacyTree: false };
    }
    return verifyInclusionDetailed(receipt, candidateStatementHex, this.publicKeyPem);
  }

  size(): number {
    return this.leaves.length;
  }
}

export function anchorReceipt(ts: MemoryTransparencyService, signed: SignedReceipt): InclusionReceipt {
  if (signed.encoding !== "cose" || !signed.coseHex) {
    throw new Error("anchor-requires-cose");
  }
  return ts.register(signed.coseHex);
}

/**
 * Establishes that the log signed this envelope: hash, index, tree head, and
 * on RFC receipts also treeSize and alg. It does NOT establish that the
 * receipt covers any statement the caller holds; for that, `verifyInclusion`.
 *
 * `expectedWitnessKeyPem` is the log's key, held out of band. Without it this
 * checks the receipt against the key it carries, so anyone able to mint a
 * keypair can assert that a statement is in a log they invented.
 *
 * A five-entry signed payload requires `receipt.alg` and `receipt.treeSize`
 * to equal the signed values. A three-entry (-00) payload requires those
 * fields to be absent on the receipt.
 */
export function verifyInclusionEnvelope(
  receipt: InclusionReceipt,
  expectedWitnessKeyPem?: string,
): boolean {
  if (receipt.alg !== undefined && receipt.alg !== RFC9162_ALG) {
    return false;
  }
  if (
    expectedWitnessKeyPem !== undefined &&
    !sameSpkiKey(receipt.issuerPublicKeyPem, expectedWitnessKeyPem)
  ) {
    return false;
  }
  const cose = strictHexBytes(receipt.coseHex);
  if (!cose || !verifyCoseSign1(cose, receipt.issuerPublicKeyPem, CTY_INCLUSION)) {
    return false;
  }
  try {
    const signed = decodeInclusionPayload(receipt.coseHex);
    if (
      signed.statementHash !== receipt.statementHash ||
      signed.index !== receipt.index ||
      signed.treeHead !== receipt.treeHead
    ) {
      return false;
    }
    if (signed.alg !== undefined) {
      return receipt.alg === signed.alg && receipt.treeSize === signed.treeSize;
    }
    return receipt.alg === undefined && receipt.treeSize === undefined;
  } catch {
    return false;
  }
}

/**
 * Tier-2 (MUST-T11-18): the receipt covers these candidate bytes under the
 * witness pin. Seven decisions, in this order; any miss is false, none throw.
 * The candidate is consumed whole (`strictHexBytes`) and the proof has to be
 * the shape the walk is defined over (`validInclusionProof`) before it is
 * applied; a proof of another shape is false here, not an exception.
 *
 * Walk mode comes from the signed payload: five entries select RFC 9162
 * (`inclusionProof.alg` and `inclusionProof.treeSize` must match the signed
 * values); three entries select the legacy walk (`alg` / `treeSize` absent
 * on the proof).
 */
export function verifyInclusion(
  receipt: InclusionReceipt,
  candidateStatementHex: string,
  expectedWitnessKeyPem?: string,
): boolean {
  return verifyInclusionDetailed(receipt, candidateStatementHex, expectedWitnessKeyPem).ok;
}

/**
 * Same decisions as `verifyInclusion`, returning whether the legacy (pre-RFC
 * 9162) walk was used. `legacyTree` is true when the signed payload is the
 * three-entry map; false when it is five-entry or when the payload cannot be
 * read. Call this when the caller needs `legacyTree`; keep `verifyInclusion`
 * for the published boolean contract.
 */
export function verifyInclusionDetailed(
  receipt: InclusionReceipt,
  candidateStatementHex: string,
  expectedWitnessKeyPem?: string,
): InclusionVerifyResult {
  if (receipt.alg !== undefined && receipt.alg !== RFC9162_ALG) {
    return { ok: false, legacyTree: false };
  }
  let signed: ReturnType<typeof decodeInclusionPayload>;
  try {
    signed = decodeInclusionPayload(receipt.coseHex);
  } catch {
    return { ok: false, legacyTree: false };
  }
  const legacyTree = signed.alg === undefined;
  if (!verifyInclusionEnvelope(receipt, expectedWitnessKeyPem)) {
    return { ok: false, legacyTree };
  }
  const bytes = strictHexBytes(candidateStatementHex);
  if (!bytes) {
    return { ok: false, legacyTree };
  }
  const statementHash = createHash("sha256").update(bytes).digest("hex");
  if (receipt.statementHash !== statementHash) {
    return { ok: false, legacyTree };
  }
  const proof: unknown = receipt.inclusionProof;
  if (!validInclusionProof(proof)) {
    return { ok: false, legacyTree };
  }
  if (proof.leafIndex !== receipt.index) {
    return { ok: false, legacyTree };
  }

  if (signed.alg === RFC9162_ALG) {
    if (proof.alg !== RFC9162_ALG || proof.treeSize !== signed.treeSize) {
      return { ok: false, legacyTree: false };
    }
    const leafHash = rfc9162LeafHash(bytes);
    if (receipt.leafHash !== undefined && receipt.leafHash !== leafHash) {
      return { ok: false, legacyTree: false };
    }
    const rfcProof: InclusionProof = {
      leafIndex: proof.leafIndex,
      siblings: proof.siblings,
      treeSize: signed.treeSize,
      alg: RFC9162_ALG,
    };
    return {
      ok: rfc9162VerifyInclusion(leafHash, rfcProof, receipt.treeHead),
      legacyTree: false,
    };
  }

  // Legacy three-entry payload: proof must omit alg and treeSize.
  if (proof.alg !== undefined || proof.treeSize !== undefined) {
    return { ok: false, legacyTree: true };
  }
  if (applyInclusionProof(statementHash, proof) !== receipt.treeHead) {
    return { ok: false, legacyTree: true };
  }
  return { ok: true, legacyTree: true };
}

export function anchorCheckpoint(
  ts: MemoryTransparencyService,
  signed: SignedCheckpoint,
): InclusionReceipt {
  return { ...ts.register(signed.coseHex), checkpoint: signed };
}

export function statementHashOfReceipt(signed: SignedReceipt): string {
  return receiptHash(signed);
}

export function statementHashOfCheckpoint(signed: SignedCheckpoint): string {
  return checkpointHash(signed);
}

export function decodeInclusionPayload(coseHex: string): {
  statementHash: string;
  index: number;
  treeHead: string;
  treeSize?: number;
  alg?: "rfc9162-sha256";
} {
  const cose = strictHexBytes(coseHex);
  if (!cose) {
    throw new Error("cose-hex");
  }
  const msg = decodeCoseSign1(cose);
  const claims = asMap(decodeCbor(msg.payload));
  const n = claims.$map.length;
  const statementHash = mapGet(claims, 1);
  const index = mapGet(claims, 2);
  const treeHead = mapGet(claims, 3);
  if (typeof statementHash !== "string" || typeof index !== "number" || typeof treeHead !== "string") {
    throw new Error("inclusion-payload");
  }
  if (n === 3) {
    if (mapGet(claims, 4) !== undefined || mapGet(claims, 5) !== undefined) {
      throw new Error("inclusion-payload");
    }
    return { statementHash, index, treeHead };
  }
  if (n === 5) {
    const treeSize = mapGet(claims, 4);
    const alg = mapGet(claims, 5);
    if (
      typeof treeSize !== "number" ||
      !Number.isSafeInteger(treeSize) ||
      treeSize < 1 ||
      treeSize > 0xffffffff ||
      alg !== RFC9162_ALG
    ) {
      throw new Error("inclusion-payload");
    }
    return { statementHash, index, treeHead, treeSize, alg };
  }
  throw new Error("inclusion-payload");
}
