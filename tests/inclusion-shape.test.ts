import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";

import { MemoryTransparencyService, applyInclusionProof, decodeInclusionPayload, validInclusionProof, verifyInclusion, verifyInclusionEnvelope, type InclusionReceipt } from "@cedulon/checkpoint";
import { buildInclusionProof, merkleRoot, rfc9162VerifyInclusion } from "@cedulon/checkpoint";
import { CTY_CHECKPOINT, CTY_INCLUSION, cborMap, encodeCbor, signCoseSign1 } from "@cedulon/cose";
import { generateReceiptKeys } from "@cedulon/receipts";

/**
 * The witness receipt's wire form: a COSE_Sign1 under the inclusion content
 * type whose payload is a CBOR map. RFC receipts carry five entries (labels
 * 1..5); -00 receipts carry three (labels 1..3). A receipt under another
 * content type, or with the wrong entry count or types, does not verify.
 * Test 42 locks the pin and the envelope-versus-payload binding; this file
 * re-signs the same map under the witness key so the false results below
 * come from the shape and not from the signature.
 */

type Payload = Array<[number, string | number]>;

function resigned(
  inc: InclusionReceipt,
  privateKeyPem: string,
  entries: Payload,
  contentType: string,
): InclusionReceipt {
  const cose = signCoseSign1(encodeCbor(cborMap(entries)), privateKeyPem, contentType);
  return { ...inc, coseHex: Buffer.from(cose).toString("hex") };
}

describe("witness receipt shape", () => {
  const witness = generateReceiptKeys();
  const log = new MemoryTransparencyService(witness);
  const inc = log.register("deadbeef");
  const five: Payload = [
    [1, inc.statementHash],
    [2, inc.index],
    [3, inc.treeHead],
    [4, inc.treeSize!],
    [5, "rfc9162-sha256"],
  ];

  it("the issued receipt, and the same map re-signed by the witness, verify", () => {
    assert.equal(verifyInclusionEnvelope(inc, witness.publicKeyPem), true);
    const same = resigned(inc, witness.privateKeyPem, five, CTY_INCLUSION);
    assert.equal(verifyInclusionEnvelope(same, witness.publicKeyPem), true, "the harness itself must pass");
  });

  it("another content type over the same map does not verify", () => {
    const wrongType = resigned(inc, witness.privateKeyPem, five, CTY_CHECKPOINT);
    assert.equal(verifyInclusionEnvelope(wrongType, witness.publicKeyPem), false);
  });

  it("a map missing one of the five entries does not verify", () => {
    for (const drop of [1, 2, 3, 4, 5]) {
      const short = resigned(
        inc,
        witness.privateKeyPem,
        five.filter(([label]) => label !== drop),
        CTY_INCLUSION,
      );
      assert.equal(verifyInclusionEnvelope(short, witness.publicKeyPem), false, `label ${drop} missing`);
    }
  });

  it("an entry of another type does not verify", () => {
    const indexAsText = resigned(
      inc,
      witness.privateKeyPem,
      [
        [1, inc.statementHash],
        [2, String(inc.index)],
        [3, inc.treeHead],
        [4, inc.treeSize!],
        [5, "rfc9162-sha256"],
      ],
      CTY_INCLUSION,
    );
    assert.equal(verifyInclusionEnvelope(indexAsText, witness.publicKeyPem), false, "index as a text string");
    const hashAsInt = resigned(
      inc,
      witness.privateKeyPem,
      [
        [1, 7],
        [2, inc.index],
        [3, inc.treeHead],
        [4, inc.treeSize!],
        [5, "rfc9162-sha256"],
      ],
      CTY_INCLUSION,
    );
    assert.equal(verifyInclusionEnvelope(hashAsInt, witness.publicKeyPem), false, "statement hash as an integer");
  });

  it("a fourth or sixth entry count does not verify", () => {
    const four = resigned(
      inc,
      witness.privateKeyPem,
      [
        [1, inc.statementHash],
        [2, inc.index],
        [3, inc.treeHead],
        [4, "undefined here"],
      ],
      CTY_INCLUSION,
    );
    assert.equal(verifyInclusionEnvelope(four, witness.publicKeyPem), false);
    const six = resigned(inc, witness.privateKeyPem, [...five, [6, "extra"]], CTY_INCLUSION);
    assert.equal(verifyInclusionEnvelope(six, witness.publicKeyPem), false);
  });
});

describe("receipt binding: inclusion leaf vs caller candidate", () => {
  const keys = generateReceiptKeys();
  const other = generateReceiptKeys();
  const log = new MemoryTransparencyService(keys);
  const statementA = Buffer.from("aa".repeat(16)).toString("hex");
  const statementB = Buffer.from("bb".repeat(16)).toString("hex");
  const recA = log.register(statementA);

  it("a valid receipt for A does not cover candidate B", () => {
    assert.equal(verifyInclusion(recA, statementB, keys.publicKeyPem), false);
    assert.equal(log.verifyInclusion(recA, statementB), false);
  });

  it("a valid receipt for A covers candidate A", () => {
    assert.equal(verifyInclusion(recA, statementA, keys.publicKeyPem), true);
    assert.equal(log.verifyInclusion(recA, statementA), true);
  });

  it("a candidate without a proof does not verify", () => {
    const { inclusionProof: _proof, ...legacy } = recA;
    assert.equal(verifyInclusion(legacy, statementA, keys.publicKeyPem), false);
    void _proof;
  });

  it("a proof whose leafIndex is not the receipt index does not verify", () => {
    const moved = {
      ...recA,
      inclusionProof: { ...recA.inclusionProof!, leafIndex: recA.index + 1 },
    };
    assert.equal(verifyInclusion(moved, statementA, keys.publicKeyPem), false);
  });

  it("an appended sibling on a one-leaf log does not verify", () => {
    const siblings = recA.inclusionProof!.siblings.map((s, i) =>
      i === 0 ? (s.startsWith("00") ? `01${s.slice(2)}` : `00${s.slice(2)}`) : s,
    );
    const flipped = {
      ...recA,
      inclusionProof: {
        ...recA.inclusionProof!,
        siblings: siblings.length === 0 ? ["11".repeat(32)] : siblings,
      },
    };
    assert.equal(verifyInclusion(flipped, statementA, keys.publicKeyPem), false);
  });

  it("a foreign witness key does not verify", () => {
    assert.equal(verifyInclusion(recA, statementA, other.publicKeyPem), false);
  });
});

describe("hex and proof shape: what the verifier refuses without throwing", () => {
  const keys = generateReceiptKeys();
  const log = new MemoryTransparencyService(keys);
  log.register("bb");
  const recA = log.register("aa");
  const hashOf = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

  it("a candidate that is not lowercase, even-length, non-empty hex is not coverage", () => {
    for (const bad of ["aazz", "AA", "aa  ", "a", "", "aa\n", "0xaa"]) {
      assert.equal(verifyInclusion(recA, bad, keys.publicKeyPem), false, JSON.stringify(bad));
    }
    assert.equal(verifyInclusion(recA, "aa", keys.publicKeyPem), true, "the honest candidate still verifies");
  });

  it("a receipt whose coseHex is not clean hex does not verify as an envelope", () => {
    assert.equal(verifyInclusionEnvelope({ ...recA, coseHex: recA.coseHex + "zz" }, keys.publicKeyPem), false);
    assert.equal(verifyInclusionEnvelope({ ...recA, coseHex: recA.coseHex.toUpperCase() }, keys.publicKeyPem), false);
    assert.equal(verifyInclusion({ ...recA, coseHex: recA.coseHex + "zz" }, "aa", keys.publicKeyPem), false);
  });

  it("the log refuses to register a statement that is not clean hex", () => {
    for (const bad of ["", "aazz", "AA", "a"]) {
      assert.throws(() => log.register(bad), /statement-hex/, JSON.stringify(bad));
    }
    assert.equal(log.size(), 2, "nothing was appended");
  });

  it("a real one-byte sibling flip on a two-leaf log does not verify", () => {
    assert.equal(recA.inclusionProof!.siblings.length, 1);
    const s = recA.inclusionProof!.siblings[0]!;
    const flipped = { ...recA, inclusionProof: { ...recA.inclusionProof!, siblings: [(s.startsWith("00") ? "01" : "00") + s.slice(2)] } };
    assert.equal(verifyInclusion(flipped, "aa", keys.publicKeyPem), false);
  });

  it("a proof whose path does not resolve to the root is refused even when the witness signed the envelope", () => {
    // The witness signs a three-entry {H(aa), index 1, treeHead H(aa)}: a one-leaf
    // root at index 1 is structurally impossible, and an empty path returns the
    // leaf unchanged, so leaf == treeHead would pass a verifier that only compares.
    const leaf = hashOf("aa");
    const envelope = resigned(recA, keys.privateKeyPem, [[1, leaf], [2, 1], [3, leaf]], CTY_INCLUSION);
    const impossible = {
      ...envelope,
      statementHash: leaf,
      index: 1,
      treeHead: leaf,
      alg: undefined,
      treeSize: undefined,
      inclusionProof: { leafIndex: 1, siblings: [] },
    };
    assert.equal(verifyInclusionEnvelope(impossible, keys.publicKeyPem), true, "the envelope itself is witness-signed");
    assert.equal(verifyInclusion(impossible, "aa", keys.publicKeyPem), false);
  });

  it("a malformed proof is false, never a throw", () => {
    const shapes: unknown[] = [
      { leafIndex: 1, siblings: null },
      { leafIndex: 1, siblings: [null] },
      { leafIndex: 1, siblings: ["zz"] },
      { leafIndex: 1, siblings: [recA.inclusionProof!.siblings[0]!.toUpperCase()] },
      { leafIndex: -1, siblings: recA.inclusionProof!.siblings },
      { leafIndex: 0.5, siblings: recA.inclusionProof!.siblings },
      { leafIndex: "1", siblings: recA.inclusionProof!.siblings },
      { leafIndex: 2, siblings: recA.inclusionProof!.siblings },
      "not an object",
    ];
    for (const proof of shapes) {
      assert.doesNotThrow(() => verifyInclusion({ ...recA, inclusionProof: proof as never }, "aa", keys.publicKeyPem), JSON.stringify(proof));
      assert.equal(verifyInclusion({ ...recA, inclusionProof: proof as never }, "aa", keys.publicKeyPem), false, JSON.stringify(proof));
    }
  });
});

describe("proof depth is not capped: the index has to resolve, the path may be long", () => {
  it("a structurally valid deep path is a proof shape; only the index rule refuses", () => {
    // A 60-level path (2^60 leaves) cannot be built here, but its shape is valid and
    // the walk over it is finite. A cap at 53 refused such a proof for no reason the
    // tree gives (gate review of c1f8243).
    const deep = { leafIndex: 0, siblings: Array.from({ length: 60 }, () => "00".repeat(32)) };
    assert.equal(validInclusionProof(deep), true);
    assert.equal(validInclusionProof({ leafIndex: 2 ** 53 - 1, siblings: deep.siblings }), true);
    assert.equal(validInclusionProof({ leafIndex: 2, siblings: ["00".repeat(32)] }), false, "index 2 needs two levels");
    assert.doesNotThrow(() => applyInclusionProof("00".repeat(32), deep));
  });
});

describe("holes and the two hex readers the review pass left open", () => {
  const keys = generateReceiptKeys();
  const log = new MemoryTransparencyService(keys);
  log.register("bb");
  const recA = log.register("aa");
  const sib = recA.inclusionProof!.siblings[0]!;

  it("a sparse siblings array is not a proof shape, and the verifier does not throw on it", () => {
    // Array.prototype.every skips holes, so [sib, <hole>] passed the shape check and the
    // walk met undefined (gate 2 of 41ca91e, FIX-1). Holes come from JS callers, not JSON.
    const holey: string[] = [sib];
    holey.length = 2;
    const proof = { leafIndex: 1, siblings: holey };
    assert.equal(validInclusionProof(proof), false);
    assert.doesNotThrow(() => verifyInclusion({ ...recA, inclusionProof: proof }, "aa", keys.publicKeyPem));
    assert.equal(verifyInclusion({ ...recA, inclusionProof: proof }, "aa", keys.publicKeyPem), false);
    assert.throws(() => applyInclusionProof(recA.statementHash, proof), /inclusion-proof/);
  });

  it("decodeInclusionPayload and applyInclusionProof read hex the same strict way", () => {
    assert.throws(() => decodeInclusionPayload(`${recA.coseHex}zz`), /cose-hex/);
    assert.throws(() => decodeInclusionPayload(recA.coseHex.toUpperCase()), /cose-hex/);
    // RFC 9162 proofs are refused by the legacy applyInclusionProof walk.
    assert.throws(() => applyInclusionProof(recA.leafHash!, recA.inclusionProof!), /inclusion-proof/);
    assert.equal(
      rfc9162VerifyInclusion(recA.leafHash!, recA.inclusionProof!, recA.treeHead),
      true,
    );
    assert.throws(() => applyInclusionProof("aazz", recA.inclusionProof!), /inclusion-proof/);
    assert.throws(() => applyInclusionProof(recA.statementHash.toUpperCase(), recA.inclusionProof!), /inclusion-proof/);
    // Legacy pad-even proof over statementHash leaves keeps the historical assert green.
    const legacyLeaves = [
      createHash("sha256").update(Buffer.from("bb", "hex")).digest("hex"),
      recA.statementHash,
    ];
    recA.inclusionProof = buildInclusionProof(legacyLeaves, recA.index);
    recA.treeHead = merkleRoot(legacyLeaves);
    assert.equal(applyInclusionProof(recA.statementHash, recA.inclusionProof!), recA.treeHead);
  });
});
