import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonical, PACKAGE_SCOPE, PROTOCOL_SHORT, PolicyEngine } from "@cedulon/core";
import {
  assertNoPiiFields,
  generateReceiptKeys,
  makeDisputeBundle,
  publicAnchorEncoding,
  receiptHash,
  scittAnchorStub,
  signReceipt,
  verifyCounterSignature,
  verifyDisputeBundle,
  verifyReceipt,
  counterSign,
} from "@cedulon/receipts";
import { wrapToolsCall } from "@cedulon/mcp-guard";
import { runDispute } from "../examples/demo/src/dispute.ts";
import { assertRunaway, runRunaway } from "../examples/demo/src/runaway.ts";

describe("receipts and hash chain", () => {
  it("verify fails after claim tamper", () => {
    const k = generateReceiptKeys();
    const signed = signReceipt(
      {
        payer: "a",
        payee: "b",
        amount: "1",
        currency: "USD",
        policyHash: "p",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        outcome: "aborted",
        timestampMs: 1,
        nonce: "n".padEnd(16, "0"),
        prevReceiptHash: null,
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(verifyReceipt(signed), true);
    const tampered = { ...signed, claims: { ...signed.claims, amount: "9" } };
    assert.equal(verifyReceipt(tampered), false);
  });

  it("rejects inconsistent noManifest flag", () => {
    const k = generateReceiptKeys();
    assert.throws(() =>
      signReceipt(
        {
          payer: "a",
          payee: "b",
          amount: "1",
          currency: "USD",
          policyHash: "p",
          manifestHash: "abc",
          noManifest: true,
          x402PaymentRef: null,
          outcome: "aborted",
          timestampMs: 1,
          nonce: "n".padEnd(16, "0"),
          prevReceiptHash: null,
        },
        k.privateKeyPem,
        k.publicKeyPem,
      ),
    );
  });

  it("hash chain links prevReceiptHash", () => {
    const k = generateReceiptKeys();
    const a = signReceipt(
      {
        payer: "a",
        payee: "b",
        amount: "1",
        currency: "USD",
        policyHash: "p",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        outcome: "aborted",
        timestampMs: 1,
        nonce: "n1".padEnd(16, "0"),
        prevReceiptHash: null,
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const b = signReceipt(
      {
        payer: "a",
        payee: "b",
        amount: "1",
        currency: "USD",
        policyHash: "p",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        outcome: "aborted",
        timestampMs: 2,
        nonce: "n2".padEnd(16, "0"),
        prevReceiptHash: receiptHash(a),
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(b.claims.prevReceiptHash, receiptHash(a));
    assert.equal(verifyReceipt(b), true);
  });

  it("public hash encoding omits payer payee amount", () => {
    const k = generateReceiptKeys();
    const signed = signReceipt(
      {
        payer: "alice",
        payee: "bob",
        amount: "42",
        currency: "USD",
        policyHash: "p",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        outcome: "aborted",
        timestampMs: 1,
        nonce: "n".padEnd(16, "0"),
        prevReceiptHash: null,
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const pub = publicAnchorEncoding(signed, "public-hash");
    const text = JSON.stringify(pub);
    assert.equal(text.includes("alice"), false);
    assert.equal(text.includes("bob"), false);
    assert.equal("amount" in pub, false);
    assert.equal("payer" in pub, false);
    assert.equal(pub.receiptHash, receiptHash(signed));
  });

  it("refuses banned PII field names", () => {
    assert.throws(() => assertNoPiiFields({ pan: "4111" }), /pii-field/);
    assert.doesNotThrow(() => assertNoPiiFields({ policyHash: "x" }));
  });

  it("SCITT stub does not claim an anchor", () => {
    const k = generateReceiptKeys();
    const signed = signReceipt(
      {
        payer: "a",
        payee: "b",
        amount: "1",
        currency: "USD",
        policyHash: "p",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        outcome: "aborted",
        timestampMs: 1,
        nonce: "n".padEnd(16, "0"),
        prevReceiptHash: null,
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const stub = scittAnchorStub(signed);
    assert.equal(stub.anchored, false);
    assert.equal(stub.statementHash, receiptHash(signed));
  });

  it("RED then GREEN: payee countersignature tamper and wrong key fail", () => {
    const issuer = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const other = generateReceiptKeys();
    const signed = signReceipt(
      {
        payer: "a",
        payee: "b",
        amount: "1",
        currency: "USD",
        policyHash: "p",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-1",
        outcome: "settled",
        timestampMs: 1,
        nonce: "n".padEnd(16, "0"),
        prevReceiptHash: null,
      },
      issuer.privateKeyPem,
      issuer.publicKeyPem,
    );
    assert.equal(verifyReceipt(signed), true);
    assert.equal(verifyCounterSignature(signed), false);
    const countersigned = counterSign(signed, payee.privateKeyPem, payee.publicKeyPem);
    assert.equal(verifyReceipt(countersigned), true);
    assert.equal(verifyCounterSignature(countersigned), true);
    assert.equal(receiptHash(countersigned), receiptHash(signed));
    const raw = Buffer.from(countersigned.counterCoseHex ?? "", "hex");
    raw[raw.length - 1] ^= 0x01;
    const tampered = { ...countersigned, counterCoseHex: raw.toString("hex") };
    assert.equal(verifyCounterSignature(tampered), false);
    assert.equal(verifyCounterSignature(countersigned, other.publicKeyPem), false);
    assert.equal(verifyCounterSignature(countersigned), true);
  });

  it("dispute bundle verifies when hashes disagree", () => {
    const bundle = makeDisputeBundle({
      manifestCanonical: "{}",
      receiptCanonical: "{}",
      deliveryBytes: Buffer.from("bad"),
      acceptanceCriteriaHash: "00",
    });
    assert.equal(bundle.matchesAcceptance, false);
    assert.equal(verifyDisputeBundle(bundle), true);
  });
});

describe("demo fixtures", () => {
  it("runaway is 3 allow and 97 block", () => {
    const r = runRunaway();
    assertRunaway(r);
    assert.equal(r.allowed, 3);
    assert.equal(r.blocked, 97);
  });

  it("dispute demo produces evidence not an award", () => {
    const d = runDispute();
    assert.equal(d.matchesAcceptance, false);
    assert.equal(d.bundleOk, true);
    assert.equal(d.countersignOk, true);
  });
});

describe("mcp-guard", () => {
  it("passes through non-spend tools", () => {
    const call = wrapToolsCall({
      engine: null,
      keys: { receiptPrivatePem: "", receiptPublicPem: "" },
      payer: "p",
      nowMs: 1,
    });
    assert.equal(call({ name: "search", arguments: {} }).isError, false);
  });

  it("denies spend when engine is missing", () => {
    const k = generateReceiptKeys();
    const call = wrapToolsCall({
      engine: null,
      keys: { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem },
      payer: "p",
      nowMs: 1,
    });
    const out = call({
      name: "spend",
      arguments: { amount: "1", currency: "USD", payee: "q", nonce: "1" },
    });
    assert.equal(out.isError, true);
    assert.equal(out.content[0].text.includes("engine-unavailable"), true);
  });

  it("allows spend inside policy", () => {
    const k = generateReceiptKeys();
    const engine = new PolicyEngine({
      maxAmount: 5n,
      maxCumulative: 5n,
      maxPayments: 1,
      windowMs: 1000,
    });
    const call = wrapToolsCall({
      engine,
      keys: { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem },
      payer: "p",
      nowMs: 1,
    });
    const out = call({
      name: "spend",
      arguments: { amount: "1", currency: "USD", payee: "q", nonce: "1" },
    });
    assert.equal(out.isError, false);
  });
});

describe("brand", () => {
  it("uses the single brand constant", () => {
    assert.equal(PROTOCOL_SHORT, "Cedulon");
    assert.equal(PACKAGE_SCOPE, "@cedulon");
  });

  it("canonical sorts object keys", () => {
    assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}');
  });
});
