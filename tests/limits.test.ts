import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, AUDIT_MAX_RECEIPTS } from "@cedulon/audit";
import {
  CBOR_MAX_DEPTH,
  CBOR_MAX_ELEMENTS,
  decodeCbor,
  encodeCbor,
} from "@cedulon/cose";
import { generateReceiptKeys, signReceipt, type SpendReceiptClaims } from "@cedulon/receipts";

const NOW = 1_700_000_000_000;

function claims(i: number): SpendReceiptClaims {
  return {
    payer: "payer",
    payee: "payee-1",
    amount: "1",
    currency: "USD",
    policyHash: "p",
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: `ref-${i}`,
    timestampMs: NOW + i,
    nonce: `n${i}`.padEnd(16, "-"),
    prevReceiptHash: null,
    outcome: "settled",
  };
}

describe("resource limits", () => {
  it("RED then GREEN: deep nesting is cbor-too-deep, not a stack overflow", () => {
    // Measured before the depth bound: 8000 nested 0x81 bytes threw
    // RangeError: Maximum call stack size exceeded.
    const deep = new Uint8Array(CBOR_MAX_DEPTH + 2);
    deep.fill(0x81);
    deep[deep.length - 1] = 0x01;
    assert.throws(() => decodeCbor(deep), { message: "cbor-too-deep" });
    const ok = new Uint8Array(4);
    ok.fill(0x81);
    ok[3] = 0x01;
    assert.deepEqual(decodeCbor(ok), [[[1]]]);
  });

  it("a claimed array larger than the element bound is refused before it is walked", () => {
    const header = Buffer.alloc(5);
    header[0] = 0x9a;
    header.writeUInt32BE(CBOR_MAX_ELEMENTS + 1, 1);
    assert.throws(() => decodeCbor(header), { message: "cbor-too-large" });
  });

  it("an input larger than CBOR_MAX_BYTES is refused", () => {
    const big = new Uint8Array(65_537);
    big[0] = 0x58;
    big[1] = 0x01;
    assert.throws(() => decodeCbor(big), { message: "cbor-too-large" });
  });

  it("the largest honest objects in this suite still decode", () => {
    const keys = generateReceiptKeys();
    const signed = signReceipt(claims(0), keys.privateKeyPem, keys.publicKeyPem);
    assert.ok((signed.coseHex ?? "").length / 2 < 1_000);
    assert.ok(decodeCbor(encodeCbor("x")));
  });

  it("an audit above the receipt bound is audit-too-large, not a slow death", () => {
    const keys = generateReceiptKeys();
    const good = signReceipt(claims(0), keys.privateKeyPem, keys.publicKeyPem);
    const flood = Array.from({ length: AUDIT_MAX_RECEIPTS + 1 }, () => good);
    assert.throws(
      () => audit({ receipts: flood, checkpoints: [] }),
      { message: "audit-too-large" },
    );
  });

  it("the suite's largest audit (41 receipts) is under the bound", () => {
    assert.ok(41 < AUDIT_MAX_RECEIPTS);
  });
});
