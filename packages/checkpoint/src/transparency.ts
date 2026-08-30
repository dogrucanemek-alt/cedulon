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
 * RFC 6962-style audit path: sibling hashes plus the leaf index.
 * A level with an odd last leaf is paired with itself so the path
 * applies without a separate leaf count.
 */
export type InclusionProof = {
  leafIndex: number;
  siblings: string[];
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
};

function sha256Bytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hex32(hex: string): Buffer {
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

export function applyInclusionProof(leafHash: string, proof: InclusionProof): string {
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
  private readonly leaves: string[] = [];
  private treeHead = "0".repeat(64);
  readonly publicKeyPem: string;
  private readonly privateKeyPem: string;

  constructor(keys: { publicKeyPem: string; privateKeyPem: string }) {
    this.publicKeyPem = keys.publicKeyPem;
    this.privateKeyPem = keys.privateKeyPem;
  }

  register(statementHex: string): InclusionReceipt {
    const statementHash = createHash("sha256").update(Buffer.from(statementHex, "hex")).digest("hex");
    const index = this.leaves.length;
    this.leaves.push(statementHash);
    this.treeHead = merkleRoot(this.leaves);
    const inclusionProof = buildInclusionProof(this.leaves, index);
    const payload = encodeCbor(
      cborMap([
        [1, statementHash],
        [2, index],
        [3, this.treeHead],
      ]),
    );
    const cose = signCoseSign1(payload, this.privateKeyPem, CTY_INCLUSION);
    return {
      statementHash,
      index,
      treeHead: this.treeHead,
      issuerPublicKeyPem: this.publicKeyPem,
      coseHex: Buffer.from(cose).toString("hex"),
      inclusionProof,
    };
  }

  /** The log answering about its own receipt: checked against this log's key. */
  verifyInclusion(receipt: InclusionReceipt): boolean {
    if (this.leaves[receipt.index] !== receipt.statementHash) {
      return false;
    }
    return verifyInclusionReceipt(receipt, this.publicKeyPem);
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
 * `expectedWitnessKeyPem` is the log's key, held out of band. Without it this
 * checks the receipt against the key it carries, so anyone able to mint a
 * keypair can assert that a statement is in a log they invented.
 *
 * The signed payload carries `index` and `treeHead` as well; comparing only
 * `statementHash` would let the envelope claim a position in the log that its
 * own signature does not support.
 */
export function verifyInclusionReceipt(
  receipt: InclusionReceipt,
  expectedWitnessKeyPem?: string,
): boolean {
  if (
    expectedWitnessKeyPem !== undefined &&
    !sameSpkiKey(receipt.issuerPublicKeyPem, expectedWitnessKeyPem)
  ) {
    return false;
  }
  if (!verifyCoseSign1(Buffer.from(receipt.coseHex, "hex"), receipt.issuerPublicKeyPem, CTY_INCLUSION)) {
    return false;
  }
  try {
    const signed = decodeInclusionPayload(receipt.coseHex);
    return (
      signed.statementHash === receipt.statementHash &&
      signed.index === receipt.index &&
      signed.treeHead === receipt.treeHead
    );
  } catch {
    return false;
  }
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
} {
  const msg = decodeCoseSign1(Buffer.from(coseHex, "hex"));
  const claims = asMap(decodeCbor(msg.payload));
  const statementHash = mapGet(claims, 1);
  const index = mapGet(claims, 2);
  const treeHead = mapGet(claims, 3);
  if (typeof statementHash !== "string" || typeof index !== "number" || typeof treeHead !== "string") {
    throw new Error("inclusion-payload");
  }
  return { statementHash, index, treeHead };
}
