import { createHash } from "node:crypto";
import {
  CTY_INCLUSION,
  asMap,
  cborMap,
  decodeCbor,
  decodeCoseSign1,
  encodeCbor,
  mapGet,
  signCoseSign1,
  verifyCoseSign1,
} from "@cedulon/cose";
import { receiptHash, type SignedReceipt } from "@cedulon/receipts";
import { checkpointHash, type SignedCheckpoint } from "./checkpoint.ts";

export type InclusionReceipt = {
  statementHash: string;
  index: number;
  treeHead: string;
  issuerPublicKeyPem: string;
  coseHex: string;
};

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
    this.treeHead = createHash("sha256")
      .update(Buffer.from(this.treeHead + statementHash, "utf8"))
      .digest("hex");
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
    };
  }

  verifyInclusion(receipt: InclusionReceipt): boolean {
    if (this.leaves[receipt.index] !== receipt.statementHash) {
      return false;
    }
    return verifyCoseSign1(Buffer.from(receipt.coseHex, "hex"), receipt.issuerPublicKeyPem, CTY_INCLUSION);
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

export function anchorCheckpoint(
  ts: MemoryTransparencyService,
  signed: SignedCheckpoint,
): InclusionReceipt {
  return ts.register(signed.coseHex);
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
