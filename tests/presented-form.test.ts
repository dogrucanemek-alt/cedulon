import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import * as cedulonAudit from "@cedulon/audit";
import { DECISION_PROFILE } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateDecisionRecordKeys, signDecisionRecord } from "@cedulon/core";
import { generateManifestKeys, signManifest } from "@cedulon/manifest";
import { generateReceiptKeys, receiptHash, signReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

import { TEST_HASH } from "./hash-fixtures.ts";

/**
 * The presented form of draft-dogru-cedulon-core-05 {#presented-form}: the
 * members each object travels with beside its signed octets, and the decoder
 * floor of MUST-T4-19. Measured on master c78f3f1, audit() accepts an
 * upper-case coseHex, a garbage `signature` on a COSE receipt, an unpadded
 * one on a JSON receipt, an unlisted member and encoding "COSE" without a
 * word, so two verifiers can read the same bundle differently. The checker
 * says which member of which object is off, before an audit is run.
 */
type Problem = { object: string; member: string | null; problem: string };
type CheckPresentedForm = (input: unknown) => Problem[];

const check = (cedulonAudit as unknown as { checkPresentedForm?: CheckPresentedForm }).checkPresentedForm;

const S = 1_700_000_000_000;
const E = S + 3_600_000;
const issuer = generateReceiptKeys();
const rail = generateExtractKeys();
const publisher = generateManifestKeys();
const decider = generateDecisionRecordKeys();
const H = createHash("sha256").update("cedulon/presented-form").digest("hex");

function claims(nonce: string, prev: string | null) {
  return {
    payer: "payer",
    payee: "payee-1",
    amount: "1",
    currency: "USD",
    policyHash: TEST_HASH,
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: `ref-${nonce}`,
    timestampMs: S + 1_000,
    nonce: nonce.padEnd(16, "-"),
    prevReceiptHash: prev,
    outcome: "settled" as const,
  };
}

/** A bundle every member of which is in the presented form. */
function honest(): Record<string, any> {
  const a = signReceipt(claims("pf-a", null), issuer.privateKeyPem, issuer.publicKeyPem);
  const b = signReceipt(claims("pf-b", receiptHash(a)), issuer.privateKeyPem, issuer.publicKeyPem, "json");
  const checkpoint = signCheckpoint(buildCheckpointClaims(1, [a, b], S, E, null), issuer.privateKeyPem, issuer.publicKeyPem);
  const extract = signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: S,
      windowEndMs: E,
      settlements: [{ ref: "ref-pf-a", amount: "1", currency: "USD", timestampMs: S + 1_000 }],
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
  const manifest = signManifest(
    {
      description: "presented form",
      amount: "1",
      currency: "USD",
      acceptanceCriteriaHash: H,
      cancelCondition: "none",
      expiresAtMs: S + 60_000,
    },
    publisher.privateKeyPem,
    publisher.publicKeyPem,
  );
  return { receipts: [a, b], checkpoints: [checkpoint], extract, manifest };
}

function decisionBundle(): Record<string, any> {
  const record = signDecisionRecord(
    {
      decider: "decider-1",
      subject: "subject-1",
      requestHash: H,
      policyHash: H,
      inputsHash: null,
      decision: "allow",
      reasonCode: "ok",
      ref: "ref-1",
      effectHash: H,
      timestampMs: S + 1_000,
      nonce: "pf-dec".padEnd(16, "-"),
      prevRecordHash: null,
      effectClass: "ig-dm-reply",
    },
    decider.privateKeyPem,
    decider.publicKeyPem,
  );
  return { receipts: [record], checkpoints: [], profile: DECISION_PROFILE };
}

function has(problems: Problem[], object: string, member: string | null, problem: string): boolean {
  return problems.some((p) => p.object === object && p.member === member && p.problem === problem);
}

describe("checkPresentedForm: the presented form of core-05, checked before an audit", () => {
  it("is exported", () => {
    assert.equal(typeof check, "function");
  });

  it("what this package's own signers produce is in the presented form", () => {
    assert.equal(typeof check, "function");
    assert.deepEqual(check!(honest()), []);
    assert.deepEqual(check!(decisionBundle()), []);
  });

  it("a COSE receipt without coseHex is missing-member", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    const { coseHex: _gone, ...rest } = bundle.receipts[0];
    bundle.receipts[0] = rest;
    assert.ok(has(check!(bundle), "receipts[0]", "coseHex", "missing-member"), JSON.stringify(check!(bundle)));
  });

  it("a checkpoint without claims, and an extract without signature, are missing-member", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    const { claims: _c, ...cp } = bundle.checkpoints[0];
    bundle.checkpoints[0] = cp;
    const { signature: _s, ...ex } = bundle.extract;
    bundle.extract = ex;
    const problems = check!(bundle);
    assert.ok(has(problems, "checkpoints[0]", "claims", "missing-member"), JSON.stringify(problems));
    assert.ok(has(problems, "extract", "signature", "missing-member"), JSON.stringify(problems));
  });

  it("coseHex in upper case is not-lowercase-hex", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    bundle.receipts[0] = { ...bundle.receipts[0], coseHex: bundle.receipts[0].coseHex.toUpperCase() };
    assert.ok(has(check!(bundle), "receipts[0]", "coseHex", "not-lowercase-hex"));
  });

  it("a signature without its padding, or outside the RFC 4648 Section 4 alphabet, is not-padded-base64", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    // 64 signature octets are 88 base64 characters, the last two of them padding.
    assert.match(bundle.receipts[1].signature, /==$/, "fixture: an Ed25519 signature in base64 ends in padding");
    bundle.receipts[1] = { ...bundle.receipts[1], signature: bundle.receipts[1].signature.replace(/=+$/, "") };
    // The URL-safe alphabet of RFC 4648 Section 5 is not the one Section 4 names.
    bundle.extract = { ...bundle.extract, signature: `-${bundle.extract.signature.slice(1)}` };
    const problems = check!(bundle);
    assert.ok(has(problems, "receipts[1]", "signature", "not-padded-base64"), JSON.stringify(problems));
    assert.ok(has(problems, "extract", "signature", "not-padded-base64"), JSON.stringify(problems));
  });

  it("a COSE receipt whose signature member is not the signature of its COSE octets is signature-mismatch", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    bundle.receipts[0] = { ...bundle.receipts[0], signature: "AAAA" };
    assert.ok(has(check!(bundle), "receipts[0]", "signature", "signature-mismatch"), JSON.stringify(check!(bundle)));
  });

  it("encoding outside cose and json is bad-encoding; a checkpoint is cose only", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    bundle.receipts[0] = { ...bundle.receipts[0], encoding: "COSE" };
    bundle.checkpoints[0] = { ...bundle.checkpoints[0], encoding: "json" };
    const problems = check!(bundle);
    assert.ok(has(problems, "receipts[0]", "encoding", "bad-encoding"), JSON.stringify(problems));
    assert.ok(has(problems, "checkpoints[0]", "encoding", "bad-encoding"), JSON.stringify(problems));
    // One fault, one line: only the JSON encoding rules coseHex out.
    assert.deepEqual(
      problems.filter((p) => p.object === "receipts[0]"),
      [{ object: "receipts[0]", member: "encoding", problem: "bad-encoding" }],
    );
  });

  it("a member the table does not name is reported as unlisted-member, and a JSON receipt's coseHex is one", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    bundle.receipts[0] = { ...bundle.receipts[0], extra: 1 };
    bundle.receipts[1] = { ...bundle.receipts[1], coseHex: "zz" };
    const problems = check!(bundle);
    assert.ok(has(problems, "receipts[0]", "extra", "unlisted-member"), JSON.stringify(problems));
    assert.ok(has(problems, "receipts[1]", "coseHex", "unlisted-member"), JSON.stringify(problems));
  });

  it("claims that differ from the claim set in the COSE octets are claims-mismatch (MUST-T4-2), for each object that carries them", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    bundle.receipts[0] = { ...bundle.receipts[0], claims: { ...bundle.receipts[0].claims, amount: "2" } };
    bundle.checkpoints[0] = { ...bundle.checkpoints[0], claims: { ...bundle.checkpoints[0].claims, receiptCount: 99 } };
    bundle.manifest = { ...bundle.manifest, body: { ...bundle.manifest.body, amount: "2" } };
    const problems = check!(bundle);
    assert.ok(has(problems, "receipts[0]", "claims", "claims-mismatch"), JSON.stringify(problems));
    assert.ok(has(problems, "checkpoints[0]", "claims", "claims-mismatch"), JSON.stringify(problems));
    assert.ok(has(problems, "manifest", "body", "claims-mismatch"), JSON.stringify(problems));
    const dec = decisionBundle();
    dec.receipts[0] = { ...dec.receipts[0], claims: { ...dec.receipts[0].claims, decision: "deny" } };
    assert.ok(has(check!(dec), "receipts[0]", "claims", "claims-mismatch"), JSON.stringify(check!(dec)));
  });

  it("COSE octets beyond the floor are refused by the decoder's own name", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    bundle.receipts[0] = { ...bundle.receipts[0], coseHex: "00".repeat(65_537) };
    bundle.checkpoints[0] = { ...bundle.checkpoints[0], coseHex: "81".repeat(18) + "00" };
    const problems = check!(bundle);
    assert.ok(has(problems, "receipts[0]", "coseHex", "cbor-too-large"), JSON.stringify(problems));
    assert.ok(has(problems, "checkpoints[0]", "coseHex", "cbor-too-deep"), JSON.stringify(problems));
  });

  it("a publicKeyPem that is not SubjectPublicKeyInfo PEM is not-spki-pem", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    bundle.extract = { ...bundle.extract, publicKeyPem: "not a key" };
    assert.ok(has(check!(bundle), "extract", "publicKeyPem", "not-spki-pem"));
  });

  it("the wrong JSON type is wrong-type, and the checker does not throw on any of it", () => {
    assert.equal(typeof check, "function");
    assert.ok(has(check!({ receipts: {}, checkpoints: [] }), "receipts", null, "wrong-type"));
    assert.ok(has(check!({ receipts: [], checkpoints: [], extract: { ...honest().extract, body: "x" } }), "extract", "body", "wrong-type"));
    assert.ok(has(check!({ receipts: [null], checkpoints: [] }), "receipts[0]", null, "wrong-type"));
    assert.ok(check!(null).length > 0);
    assert.ok(check!("text").length > 0);
  });

  it("previousExtract, nextExtract and anchorCheckpoint are checked like extract and checkpoints", () => {
    assert.equal(typeof check, "function");
    const bundle = honest();
    bundle.previousExtract = { ...bundle.extract, signature: "" };
    bundle.nextExtract = { ...bundle.extract, extra: true };
    bundle.anchorCheckpoint = { ...bundle.checkpoints[0], coseHex: bundle.checkpoints[0].coseHex.toUpperCase() };
    const problems = check!(bundle);
    assert.ok(problems.some((p) => p.object === "previousExtract" && p.member === "signature"), JSON.stringify(problems));
    assert.ok(has(problems, "nextExtract", "extra", "unlisted-member"), JSON.stringify(problems));
    assert.ok(has(problems, "anchorCheckpoint", "coseHex", "not-lowercase-hex"), JSON.stringify(problems));
  });
});
