import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { MemoryTransparencyService, verifyInclusion, verifyInclusionEnvelope, type InclusionReceipt } from "@cedulon/checkpoint";
import { CTY_CHECKPOINT, CTY_INCLUSION, cborMap, encodeCbor, signCoseSign1 } from "@cedulon/cose";
import { generateReceiptKeys } from "@cedulon/receipts";

/**
 * The witness receipt's wire form is stated in -07: a COSE_Sign1 under the
 * inclusion content type whose payload is a CBOR map with label 1 the
 * statement hash, 2 the entry index, 3 the tree head. The draft says a
 * receipt under another content type, or with one of the three entries
 * missing or of another type, does not verify, and that an entry under a
 * label the map does not define is not refused. Test 42 locks the pin and
 * the envelope-versus-payload binding; nothing locked the shape sentence
 * until this file, which re-signs the same map under the witness key so the
 * false results below come from the shape and not from the signature.
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
  const three: Payload = [
    [1, inc.statementHash],
    [2, inc.index],
    [3, inc.treeHead],
  ];

  it("the issued receipt, and the same map re-signed by the witness, verify", () => {
    assert.equal(verifyInclusionEnvelope(inc, witness.publicKeyPem), true);
    const same = resigned(inc, witness.privateKeyPem, three, CTY_INCLUSION);
    assert.equal(verifyInclusionEnvelope(same, witness.publicKeyPem), true, "the harness itself must pass");
  });

  it("another content type over the same map does not verify", () => {
    const wrongType = resigned(inc, witness.privateKeyPem, three, CTY_CHECKPOINT);
    assert.equal(verifyInclusionEnvelope(wrongType, witness.publicKeyPem), false);
  });

  it("a map missing one of the three entries does not verify", () => {
    for (const drop of [1, 2, 3]) {
      const short = resigned(
        inc,
        witness.privateKeyPem,
        three.filter(([label]) => label !== drop),
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
      ],
      CTY_INCLUSION,
    );
    assert.equal(verifyInclusionEnvelope(hashAsInt, witness.publicKeyPem), false, "statement hash as an integer");
  });

  it("an entry under a label the map does not define is not refused, as the draft says", () => {
    const extra = resigned(inc, witness.privateKeyPem, [...three, [4, "undefined here"]], CTY_INCLUSION);
    assert.equal(verifyInclusionEnvelope(extra, witness.publicKeyPem), true);
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

  it("a one-byte sibling flip does not verify", () => {
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
