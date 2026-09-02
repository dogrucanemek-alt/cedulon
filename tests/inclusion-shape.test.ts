import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { MemoryTransparencyService, verifyInclusionReceipt, type InclusionReceipt } from "@cedulon/checkpoint";
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
    assert.equal(verifyInclusionReceipt(inc, witness.publicKeyPem), true);
    const same = resigned(inc, witness.privateKeyPem, three, CTY_INCLUSION);
    assert.equal(verifyInclusionReceipt(same, witness.publicKeyPem), true, "the harness itself must pass");
  });

  it("another content type over the same map does not verify", () => {
    const wrongType = resigned(inc, witness.privateKeyPem, three, CTY_CHECKPOINT);
    assert.equal(verifyInclusionReceipt(wrongType, witness.publicKeyPem), false);
  });

  it("a map missing one of the three entries does not verify", () => {
    for (const drop of [1, 2, 3]) {
      const short = resigned(
        inc,
        witness.privateKeyPem,
        three.filter(([label]) => label !== drop),
        CTY_INCLUSION,
      );
      assert.equal(verifyInclusionReceipt(short, witness.publicKeyPem), false, `label ${drop} missing`);
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
    assert.equal(verifyInclusionReceipt(indexAsText, witness.publicKeyPem), false, "index as a text string");
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
    assert.equal(verifyInclusionReceipt(hashAsInt, witness.publicKeyPem), false, "statement hash as an integer");
  });

  it("an entry under a label the map does not define is not refused, as the draft says", () => {
    const extra = resigned(inc, witness.privateKeyPem, [...three, [4, "undefined here"]], CTY_INCLUSION);
    assert.equal(verifyInclusionReceipt(extra, witness.publicKeyPem), true);
  });
});
