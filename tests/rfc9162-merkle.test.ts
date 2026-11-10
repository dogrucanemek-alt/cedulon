import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  MemoryTransparencyService,
  RFC9162_EMPTY_ROOT,
  buildInclusionProof,
  merkleParent,
  merkleRoot,
  rfc9162InclusionProof,
  rfc9162LeafHash,
  rfc9162NodeHash,
  rfc9162Root,
  rfc9162VerifyInclusion,
  validInclusionProof,
  verifyInclusion,
  verifyInclusionDetailed,
  type InclusionReceipt,
} from "@cedulon/checkpoint";
import { CTY_INCLUSION, cborMap, encodeCbor, signCoseSign1 } from "@cedulon/cose";
import { generateReceiptKeys } from "@cedulon/receipts";

function entry(label: string): Uint8Array {
  return Buffer.from(label, "utf8");
}

function leafOf(label: string): string {
  return rfc9162LeafHash(entry(label));
}

describe("RFC 9162 Merkle tree hash", () => {
  it("empty tree root is SHA-256 of the empty string", () => {
    assert.equal(rfc9162Root([]), RFC9162_EMPTY_ROOT);
    assert.equal(
      RFC9162_EMPTY_ROOT,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("[a,b,c] and [a,b,c,c] produce different roots (no self-pad)", () => {
    const abc = ["a", "b", "c"].map(leafOf);
    const abcc = ["a", "b", "c", "c"].map(leafOf);
    assert.notEqual(rfc9162Root(abc), rfc9162Root(abcc));
  });

  it("domain separation: an interior node hash is not accepted as a leaf", () => {
    const leaves = ["a", "b", "c", "d"].map(leafOf);
    const root = rfc9162Root(leaves);
    const interior = rfc9162NodeHash(leaves[0]!, leaves[1]!);
    const proof = rfc9162InclusionProof(leaves, 0);
    assert.equal(rfc9162VerifyInclusion(interior, proof, root), false);
    assert.equal(rfc9162VerifyInclusion(leaves[0]!, proof, root), true);
  });

  it("node hash carries the 0x01 prefix (mutation target)", () => {
    const left = "11".repeat(32);
    const right = "22".repeat(32);
    const expected = createHash("sha256")
      .update(Buffer.concat([Buffer.from([0x01]), Buffer.from(left, "hex"), Buffer.from(right, "hex")]))
      .digest("hex");
    assert.equal(rfc9162NodeHash(left, right), expected);
    assert.notEqual(rfc9162NodeHash(left, right), merkleParent(left, right));
  });

  it("every index in trees of size 1..33 verifies; sibling bit-flip fails; treeSize is bound by the signed payload, see signed treeSize and alg bind inclusion (C7)", () => {
    for (let n = 1; n <= 33; n += 1) {
      const leaves = Array.from({ length: n }, (_, i) => leafOf(`e${i}`));
      const root = rfc9162Root(leaves);
      for (let i = 0; i < n; i += 1) {
        const proof = rfc9162InclusionProof(leaves, i);
        assert.equal(proof.alg, "rfc9162-sha256");
        assert.equal(proof.treeSize, n);
        assert.equal(rfc9162VerifyInclusion(leaves[i]!, proof, root), true, `n=${n} i=${i}`);

        if (proof.siblings.length > 0) {
          const s0 = proof.siblings[0]!;
          const flipped = {
            ...proof,
            siblings: [(s0.startsWith("00") ? "01" : "00") + s0.slice(2), ...proof.siblings.slice(1)],
          };
          assert.equal(rfc9162VerifyInclusion(leaves[i]!, flipped, root), false, `flip n=${n} i=${i}`);
        }

        // rfc9162VerifyInclusion alone does not bind treeSize to a log epoch.
        // When path lengths coincide (e.g. n=3→4 at i=0), the same siblings can
        // still hash to this root; the neighbouring tree's root must refuse.
        const plus = { ...proof, treeSize: n + 1 };
        if (rfc9162VerifyInclusion(leaves[i]!, plus, root)) {
          const bigger = [...leaves, leafOf(`x${n}`)];
          assert.equal(
            rfc9162VerifyInclusion(leaves[i]!, plus, rfc9162Root(bigger)),
            false,
            `treeSize+1 vs neighbouring root n=${n} i=${i}`,
          );
        }
        if (n > 1 && i < n - 1) {
          const minus = { ...proof, treeSize: n - 1 };
          if (rfc9162VerifyInclusion(leaves[i]!, minus, root)) {
            const smaller = leaves.slice(0, n - 1);
            assert.equal(
              rfc9162VerifyInclusion(leaves[i]!, minus, rfc9162Root(smaller)),
              false,
              `treeSize-1 vs neighbouring root n=${n} i=${i}`,
            );
          }
        } else if (n > 1 && i >= n - 1) {
          const minus = { ...proof, treeSize: n - 1 };
          assert.equal(rfc9162VerifyInclusion(leaves[i]!, minus, root), false, `treeSize-1 idx n=${n} i=${i}`);
        }
      }
    }
  });
});

describe("legacy inclusion receipts still verify and are marked", () => {
  it("a pad-even legacy receipt verifies with the same pass/fail and legacyTree: true", () => {
    const keys = generateReceiptKeys();
    const statementHex = "deadbeef";
    const statement = Buffer.from(statementHex, "hex");
    const statementHash = createHash("sha256").update(statement).digest("hex");
    // Build a two-leaf legacy tree the old way (statementHash leaves, self-pad).
    const other = createHash("sha256").update(Buffer.from("cafebabe", "hex")).digest("hex");
    const leaves = [statementHash, other];
    const treeHead = merkleRoot(leaves);
    const inclusionProof = buildInclusionProof(leaves, 0);
    const payload = encodeCbor(
      cborMap([
        [1, statementHash],
        [2, 0],
        [3, treeHead],
      ]),
    );
    const cose = signCoseSign1(payload, keys.privateKeyPem, CTY_INCLUSION);
    const legacy: InclusionReceipt = {
      statementHash,
      index: 0,
      treeHead,
      issuerPublicKeyPem: keys.publicKeyPem,
      coseHex: Buffer.from(cose).toString("hex"),
      inclusionProof,
    };
    const detailed = verifyInclusionDetailed(legacy, statementHex, keys.publicKeyPem);
    assert.deepEqual(detailed, { ok: true, legacyTree: true });
    const b: boolean = verifyInclusion(legacy, statementHex, keys.publicKeyPem);
    assert.strictEqual(typeof b, "boolean");
    assert.strictEqual(b, true);

    const bad = verifyInclusionDetailed(legacy, "cafebabe", keys.publicKeyPem);
    assert.equal(bad.ok, false);
    assert.equal(bad.legacyTree, true);
  });

  it("unknown alg is refused", () => {
    const keys = generateReceiptKeys();
    const log = new MemoryTransparencyService(keys);
    const rec = log.register("aa");
    const unknown = { ...rec, alg: "mystery-hash" as never };
    assert.equal(verifyInclusion(unknown, "aa", keys.publicKeyPem), false);
    assert.equal(verifyInclusionDetailed(unknown, "aa", keys.publicKeyPem).ok, false);
  });
});

describe("signed treeSize and alg bind inclusion (C7)", () => {
  function abcIndex0Receipt(keys: { publicKeyPem: string; privateKeyPem: string }): {
    receipt: InclusionReceipt;
    statementHex: string;
  } {
    const statementHex = "aa";
    const statement = Buffer.from(statementHex, "hex");
    const statementHash = createHash("sha256").update(statement).digest("hex");
    const leafHashes = ["aa", "bb", "cc"].map((s) => rfc9162LeafHash(Buffer.from(s, "hex")));
    const treeHead = rfc9162Root(leafHashes);
    const inclusionProof = rfc9162InclusionProof(leafHashes, 0);
    const treeSize = 3;
    const payload = encodeCbor(
      cborMap([
        [1, statementHash],
        [2, 0],
        [3, treeHead],
        [4, treeSize],
        [5, "rfc9162-sha256"],
      ]),
    );
    const cose = signCoseSign1(payload, keys.privateKeyPem, CTY_INCLUSION);
    const leafHash = rfc9162LeafHash(statement);
    return {
      statementHex,
      receipt: {
        statementHash,
        leafHash,
        index: 0,
        treeHead,
        treeSize,
        alg: "rfc9162-sha256",
        issuerPublicKeyPem: keys.publicKeyPem,
        coseHex: Buffer.from(cose).toString("hex"),
        inclusionProof,
      },
    };
  }

  it("treeSize bumped 3 to 4 on receipt and proof fails verifyInclusion", () => {
    const keys = generateReceiptKeys();
    const { receipt, statementHex } = abcIndex0Receipt(keys);
    assert.equal(verifyInclusion(receipt, statementHex, keys.publicKeyPem), true);
    const bumped: InclusionReceipt = {
      ...receipt,
      treeSize: 4,
      inclusionProof: { ...receipt.inclusionProof!, treeSize: 4 },
    };
    assert.equal(verifyInclusion(bumped, statementHex, keys.publicKeyPem), false);
  });

  it("missing receipt.alg fails verifyInclusion", () => {
    const keys = generateReceiptKeys();
    const { receipt, statementHex } = abcIndex0Receipt(keys);
    const { alg: _alg, ...stripped } = receipt;
    void _alg;
    assert.equal(verifyInclusion(stripped, statementHex, keys.publicKeyPem), false);
  });

  it("missing inclusionProof.alg fails verifyInclusion", () => {
    const keys = generateReceiptKeys();
    const { receipt, statementHex } = abcIndex0Receipt(keys);
    const { alg: _alg, ...proofRest } = receipt.inclusionProof!;
    void _alg;
    const stripped: InclusionReceipt = {
      ...receipt,
      inclusionProof: proofRest,
    };
    assert.equal(verifyInclusion(stripped, statementHex, keys.publicKeyPem), false);
  });
});

describe("MemoryTransparencyService issues RFC 9162 receipts", () => {
  it("five statements each carry alg + treeSize and verifyInclusion passes", () => {
    const keys = generateReceiptKeys();
    const log = new MemoryTransparencyService(keys);
    const statements = ["aa", "bb", "cc", "dd", "ee"];
    const receipts = statements.map((s) => log.register(s));
    assert.equal(log.size(), 5);
    for (let i = 0; i < receipts.length; i += 1) {
      const rec = receipts[i]!;
      assert.equal(rec.alg, "rfc9162-sha256");
      // treeSize is the log size at issuance, not the final size.
      assert.equal(rec.treeSize, i + 1);
      assert.equal(rec.inclusionProof?.alg, "rfc9162-sha256");
      assert.equal(rec.inclusionProof?.treeSize, i + 1);
      assert.ok(rec.leafHash);
      assert.notEqual(rec.leafHash, rec.statementHash);
      assert.equal(verifyInclusion(rec, statements[i]!, keys.publicKeyPem), true);
      assert.deepEqual(verifyInclusionDetailed(rec, statements[i]!, keys.publicKeyPem), {
        ok: true,
        legacyTree: false,
      });
      const logOk: boolean = log.verifyInclusion(rec, statements[i]!);
      assert.strictEqual(typeof logOk, "boolean");
      assert.strictEqual(logOk, true);
      assert.deepEqual(log.verifyInclusionDetailed(rec, statements[i]!), {
        ok: true,
        legacyTree: false,
      });
    }
  });

  it("verifyInclusionDetailed marks broken RFC receipts as ok:false", () => {
    const keys = generateReceiptKeys();
    const log = new MemoryTransparencyService(keys);
    const rec = log.register("aa");
    const broken = verifyInclusionDetailed(rec, "bb", keys.publicKeyPem);
    assert.equal(broken.ok, false);
    assert.equal(broken.legacyTree, false);
  });

  it("receipt.treeSize that disagrees with inclusionProof.treeSize is refused", () => {
    const keys = generateReceiptKeys();
    const log = new MemoryTransparencyService(keys);
    const statementHex = "aa";
    const rec = log.register(statementHex);
    assert.ok(rec.treeSize !== undefined);
    assert.ok(rec.inclusionProof?.treeSize !== undefined);
    const mismatched = { ...rec, treeSize: rec.inclusionProof!.treeSize! + 1 };
    assert.equal(verifyInclusion(mismatched, statementHex, keys.publicKeyPem), false);
    assert.deepEqual(verifyInclusionDetailed(mismatched, statementHex, keys.publicKeyPem), {
      ok: false,
      legacyTree: false,
    });
  });

  it("a one-bit flip of receipt.leafHash fails verifyInclusion", () => {
    const keys = generateReceiptKeys();
    const log = new MemoryTransparencyService(keys);
    const statementHex = "aa";
    const rec = log.register(statementHex);
    assert.ok(rec.leafHash);
    const flippedLeaf =
      (rec.leafHash!.startsWith("0") ? "1" : "0") + rec.leafHash!.slice(1);
    assert.notEqual(flippedLeaf, rec.leafHash);
    const tampered = { ...rec, leafHash: flippedLeaf };
    assert.equal(verifyInclusion(tampered, statementHex, keys.publicKeyPem), false);
    assert.equal(log.verifyInclusion(tampered, statementHex), false);
    assert.deepEqual(verifyInclusionDetailed(tampered, statementHex, keys.publicKeyPem), {
      ok: false,
      legacyTree: false,
    });
  });
});

describe("RFC 9162 treeSize 32-bit bound", () => {
  it("validInclusionProof and rfc9162VerifyInclusion refuse treeSize above 0xffffffff", () => {
    const base = {
      leafIndex: 0,
      siblings: [] as string[],
      alg: "rfc9162-sha256" as const,
    };
    assert.equal(validInclusionProof({ ...base, treeSize: 0xffffffff }), true);
    assert.equal(validInclusionProof({ ...base, treeSize: 2 ** 32 }), false);
    assert.equal(validInclusionProof({ ...base, treeSize: 2 ** 40 }), false);
    const leaf = "11".repeat(32);
    const root = leaf;
    assert.equal(
      rfc9162VerifyInclusion(leaf, { ...base, treeSize: 2 ** 32 }, root),
      false,
    );
    assert.equal(
      rfc9162VerifyInclusion(leaf, { ...base, treeSize: 2 ** 40 }, root),
      false,
    );
  });
});
