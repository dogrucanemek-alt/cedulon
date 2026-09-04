import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildCheckpointClaims, totalsFromDecisionRecords } from "@cedulon/checkpoint";
import {
  generateDecisionRecordKeys,
  decisionRecordHash,
  decisionRecordToCbor,
  findDecisionRecordChainBreak,
  signDecisionRecord,
  signDecisionToken,
  verifyDecisionRecord,
  verifyDecisionToken,
  type DecisionRecordClaims,
  type SignedDecisionRecord,
} from "@cedulon/core";
import { asSigner, CTY_DECISION_RECORD, signCoseSign1 } from "@cedulon/cose";

const H = createHash("sha256").update("cedulon/decision-record-test").digest("hex");
const H2 = createHash("sha256").update("cedulon/decision-record-other").digest("hex");
const NOW = 1_700_000_000_000;

function base(over: Partial<DecisionRecordClaims> = {}): DecisionRecordClaims {
  return {
    decider: "decider-1",
    subject: "subject-1",
    requestHash: H,
    policyHash: H,
    inputsHash: null,
    decision: "allow",
    reasonCode: "ok",
    ref: "ref-1",
    effectHash: H,
    timestampMs: NOW,
    nonce: "n-rec".padEnd(16, "-"),
    prevRecordHash: null,
    effectClass: "ig-dm-reply",
    ...over,
  };
}

describe("decision record: signed, chained, not a token", () => {
  it("sign then verify; a foreign key is false", () => {
    const a = generateDecisionRecordKeys();
    const b = generateDecisionRecordKeys();
    const signed = signDecisionRecord(base(), a.privateKeyPem, a.publicKeyPem);
    assert.equal(verifyDecisionRecord(signed), true);
    assert.equal(verifyDecisionRecord(signed, a.publicKeyPem), true);
    assert.equal(verifyDecisionRecord(signed, b.publicKeyPem), false);
  });

  it("a hash that is not 64-character lowercase hex is refused at sign", () => {
    const k = generateDecisionRecordKeys();
    assert.throws(
      () => signDecisionRecord(base({ policyHash: "zz" }), k.privateKeyPem, k.publicKeyPem),
      /malformed-policy-hash/,
    );
    assert.throws(
      () => signDecisionRecord(base({ requestHash: "AA" }), k.privateKeyPem, k.publicKeyPem),
      /malformed-request-hash/,
    );
    assert.throws(
      () => signDecisionRecord(base({ effectHash: "aa" }), k.privateKeyPem, k.publicKeyPem),
      /malformed-effect-hash/,
    );
    assert.throws(
      () => signDecisionRecord(base({ inputsHash: "not-hex" }), k.privateKeyPem, k.publicKeyPem),
      /malformed-inputs-hash/,
    );
  });

  it("decision must be allow, deny, or defer", () => {
    const k = generateDecisionRecordKeys();
    assert.throws(
      () =>
        signDecisionRecord(
          base({ decision: "maybe" as DecisionRecordClaims["decision"] }),
          k.privateKeyPem,
          k.publicKeyPem,
        ),
      /decision must be allow, deny, or defer/,
    );
  });

  it("allow requires ref and effectHash; deny and defer may omit both", () => {
    const k = generateDecisionRecordKeys();
    assert.throws(
      () => signDecisionRecord(base({ ref: null }), k.privateKeyPem, k.publicKeyPem),
      /allow-requires-ref/,
    );
    assert.throws(
      () => signDecisionRecord(base({ effectHash: null }), k.privateKeyPem, k.publicKeyPem),
      /allow-requires-effect-hash/,
    );
    assert.throws(
      () => signDecisionRecord(base({ effectClass: null }), k.privateKeyPem, k.publicKeyPem),
      /allow-requires-effect-class/,
    );
    assert.throws(
      () => signDecisionRecord(base({ effectClass: "" }), k.privateKeyPem, k.publicKeyPem),
      /allow-requires-effect-class/,
    );
    const deny = signDecisionRecord(
      base({ decision: "deny", ref: null, effectHash: null, reasonCode: "silent" }),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(verifyDecisionRecord(deny, k.publicKeyPem), true);
    const defer = signDecisionRecord(
      base({ decision: "defer", ref: null, effectHash: null, reasonCode: "ask" }),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(verifyDecisionRecord(defer, k.publicKeyPem), true);
    const denyNamed = signDecisionRecord(
      base({ decision: "deny", ref: null, effectHash: null, effectClass: "ig-dm-reply", reasonCode: "silent" }),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(denyNamed.claims.effectClass, "ig-dm-reply");
    assert.equal(verifyDecisionRecord(denyNamed, k.publicKeyPem), true);
    const denyBare = signDecisionRecord(
      base({ decision: "deny", ref: null, effectHash: null, effectClass: null, reasonCode: "silent" }),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(denyBare.claims.effectClass, null);
    assert.equal(verifyDecisionRecord(denyBare, k.publicKeyPem), true);
  });

  it("under a pin the signature is checked against the pin; the carried key is a surface", () => {
    // Core 6.3 / 10.1: a carried key is not an identity source. An honest
    // record whose carried PEM was swapped still verifies under the pin
    // (the audit reports carried-key-mismatch as a warning); with no pin
    // held the carried key is the only key there is, and it is the wrong one.
    const k = generateDecisionRecordKeys();
    const other = generateDecisionRecordKeys();
    const signed = signDecisionRecord(base(), k.privateKeyPem, k.publicKeyPem);
    const swapped: SignedDecisionRecord = { ...signed, publicKeyPem: other.publicKeyPem };
    assert.equal(verifyDecisionRecord(swapped, k.publicKeyPem), true, "under the pin");
    assert.equal(verifyDecisionRecord(swapped), false, "no pin: the carried key does not verify it");
    assert.equal(verifyDecisionRecord(swapped, other.publicKeyPem), false, "under the wrong pin");
  });

  it("timestampMs is a non-negative safe integer, at signing and at verification", () => {
    const k = generateDecisionRecordKeys();
    assert.throws(
      () => signDecisionRecord(base({ timestampMs: 1.5 }), k.privateKeyPem, k.publicKeyPem),
      /decision-record-timestamp/,
    );
    assert.throws(
      () => signDecisionRecord(base({ timestampMs: -1 }), k.privateKeyPem, k.publicKeyPem),
      /decision-record-timestamp/,
    );
    const below = (claims: DecisionRecordClaims): SignedDecisionRecord => {
      const cose = signCoseSign1(
        decisionRecordToCbor(claims),
        asSigner(k.privateKeyPem, k.publicKeyPem),
        CTY_DECISION_RECORD,
      );
      return { claims, publicKeyPem: k.publicKeyPem, encoding: "cose", coseHex: Buffer.from(cose).toString("hex") };
    };
    assert.equal(verifyDecisionRecord(below(base({ timestampMs: -1 }))), false, "negative, signed below the API");
    // Beyond a safe integer the CBOR encoder refuses first, by name; the
    // rule above is for a decoder handed such bytes from elsewhere.
    assert.throws(() => below(base({ timestampMs: 2 ** 53 })), /cbor-non-integer/);
  });

  it("a refusal carries no effectHash; it may still carry the ref it refused", () => {
    // The profile binds deny/defer to the absence of a row, never to a
    // hash, so a hash on a refusal would be a claim the audit cannot
    // measure. Fewer states, no second reading of "was it sent".
    const k = generateDecisionRecordKeys();
    assert.throws(
      () => signDecisionRecord(base({ decision: "deny", effectHash: H }), k.privateKeyPem, k.publicKeyPem),
      /refusal-carries-effect-hash/,
    );
    assert.throws(
      () => signDecisionRecord(base({ decision: "defer", effectHash: H, ref: null }), k.privateKeyPem, k.publicKeyPem),
      /refusal-carries-effect-hash/,
    );
    const denyWithRef = signDecisionRecord(
      base({ decision: "deny", effectHash: null, reasonCode: "silent" }),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(denyWithRef.claims.ref, "ref-1");
    assert.equal(verifyDecisionRecord(denyWithRef, k.publicKeyPem), true);
  });

  it("the verifier applies the signer's rules: a record signed below the API is false", () => {
    // The decider is the party under audit. A signer that skipped
    // assertDecisionRecordClaims still produces a well-formed COSE Sign1
    // over the CBOR map; the verifier must refuse it on the same rules,
    // not trust that the signer applied them.
    const k = generateDecisionRecordKeys();
    const below = (claims: DecisionRecordClaims): SignedDecisionRecord => {
      const cose = signCoseSign1(
        decisionRecordToCbor(claims),
        asSigner(k.privateKeyPem, k.publicKeyPem),
        CTY_DECISION_RECORD,
      );
      return { claims, publicKeyPem: k.publicKeyPem, encoding: "cose", coseHex: Buffer.from(cose).toString("hex") };
    };
    assert.equal(verifyDecisionRecord(below(base({ ref: null }))), false, "allow without ref");
    assert.equal(verifyDecisionRecord(below(base({ effectHash: null }))), false, "allow without effectHash");
    assert.equal(verifyDecisionRecord(below(base({ effectClass: null }))), false, "allow without effectClass");
    assert.equal(verifyDecisionRecord(below(base({ effectClass: "" }))), false, "allow with empty effectClass");
    assert.equal(verifyDecisionRecord(below(base({ requestHash: "not-a-hash" }))), false, "malformed requestHash");
    assert.equal(verifyDecisionRecord(below(base({ prevRecordHash: "AA" }))), false, "malformed prevRecordHash");
    assert.equal(verifyDecisionRecord(below(base({ decision: "deny", effectHash: H }))), false, "deny with effectHash");
    // Control: the same path with claims the signer would have accepted.
    assert.equal(verifyDecisionRecord(below(base())), true, "well-formed allow");
    assert.equal(
      verifyDecisionRecord(below(base({ decision: "deny", ref: null, effectHash: null, reasonCode: "silent" }))),
      true,
      "well-formed deny",
    );
  });

  it("a forged prevRecordHash is a chain break, not a signature failure", () => {
    const k = generateDecisionRecordKeys();
    const first = signDecisionRecord(base({ nonce: "n-a".padEnd(16, "-") }), k.privateKeyPem, k.publicKeyPem);
    const linked = signDecisionRecord(
      base({ nonce: "n-b".padEnd(16, "-"), prevRecordHash: decisionRecordHash(first), ref: "ref-2" }),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(findDecisionRecordChainBreak([first, linked]), null);
    const forged = signDecisionRecord(
      base({ nonce: "n-c".padEnd(16, "-"), prevRecordHash: H2, ref: "ref-3" }),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(verifyDecisionRecord(forged, k.publicKeyPem), true);
    const brk = findDecisionRecordChainBreak([first, forged]);
    assert.ok(brk);
    assert.equal(brk.reason, "broken-link");
    assert.equal(brk.index, 1);
  });

  it("a Decision Token is not a Decision Record, and the reverse", () => {
    const k = generateDecisionRecordKeys();
    const record = signDecisionRecord(base(), k.privateKeyPem, k.publicKeyPem);
    const token = signDecisionToken(
      {
        requestHash: H,
        policyHash: H,
        expiryMs: NOW + 60_000,
        nonce: "n-tok".padEnd(16, "-"),
        singleUseId: "once-1",
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    assert.equal(
      verifyDecisionRecord({
        claims: record.claims,
        publicKeyPem: token.publicKeyPem,
        encoding: "cose",
        coseHex: token.coseHex,
      }),
      false,
    );
    assert.equal(
      verifyDecisionToken({
        claims: token.claims,
        publicKeyPem: record.publicKeyPem,
        encoding: "cose",
        coseHex: record.coseHex,
      }),
      false,
    );
  });

  it("checkpoint totals count decision classes; chain head is the last record hash", () => {
    const k = generateDecisionRecordKeys();
    const allow = signDecisionRecord(base(), k.privateKeyPem, k.publicKeyPem);
    const deny = signDecisionRecord(
      base({
        decision: "deny",
        ref: null,
        effectHash: null,
        nonce: "n-deny".padEnd(16, "-"),
        prevRecordHash: decisionRecordHash(allow),
      }),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const claims = buildCheckpointClaims(
      1,
      [allow, deny],
      NOW,
      NOW + 1,
      null,
      totalsFromDecisionRecords,
      decisionRecordHash,
    );
    assert.deepEqual(claims.totals, { allow: "1", deny: "1", defer: "0" });
    assert.equal(claims.chainHeadHash, decisionRecordHash(deny));
    assert.equal(claims.receiptCount, 2);
  });
});
