import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { audit } from "@cedulon/audit";
import {
  findCheckpointChainBreak,
  findEquivocation,
  signCheckpoint,
  verifyCheckpoint,
  verifyInclusionReceipt,
} from "@cedulon/checkpoint";
import { canonical, jcsEncodeRefusal, signDecisionToken, verifyDecisionToken } from "@cedulon/core";
import { signManifest, verifyManifest } from "@cedulon/manifest";
import {
  generateReceiptKeys,
  signReceipt,
  signReceiptJson,
  verifyCounterSignature,
  verifyReceipt,
  verifyReceiptJson,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, verifyRailExtract } from "@cedulon/x402-adapter";

import { CedulonSession } from "../packages/mcp-server/src/session.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LONE = "\uDEAD";

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (n < 0xdc00 || n > 0xdfff) return true;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

describe("lone surrogate (RFC 8785 §3.2.2.2 / Tiago 561)", () => {
  it("GREEN: Appendix A vectors and fixtures carry no lone surrogate", () => {
    const hits: string[] = [];
    for (const rel of ["conformance", "tests", "examples", "spec", "docs"]) {
      for (const p of walkFiles(join(root, rel))) {
        const ext = extname(p);
        if (![".md", ".json", ".ts", ".txt", ".hex", ""].includes(ext) && !p.endsWith(".out.txt")) {
          continue;
        }
        const text = readFileSync(p, "utf8");
        if (hasLoneSurrogate(text)) hits.push(p);
        if (p.endsWith(".json")) {
          try {
            const walk = (v: unknown) => {
              if (typeof v === "string" && hasLoneSurrogate(v)) hits.push(p);
              else if (Array.isArray(v)) v.forEach(walk);
              else if (v && typeof v === "object") Object.values(v).forEach(walk);
            };
            walk(JSON.parse(text));
          } catch {
            /* not JSON */
          }
        }
      }
    }
    assert.deepEqual(hits, [], "a lone surrogate in existing bytes needs a protocol question before this encoder changes");
  });

  it("RED then GREEN: canonical refuses a lone surrogate by name", () => {
    assert.throws(() => canonical(LONE), /lone-surrogate/);
    assert.throws(() => canonical({ payer: LONE }), /lone-surrogate/);
    assert.throws(() => canonical({ [LONE]: "x" }), /lone-surrogate/);
    assert.equal(jcsEncodeRefusal(LONE), "lone-surrogate");
    assert.equal(canonical("\ud83d\ude00"), JSON.stringify("\ud83d\ude00"));
  });

  it("RED then GREEN: a producer refuses to sign what it cannot encode", () => {
    const k = generateReceiptKeys();
    const claims = {
      payer: LONE,
      payee: "q",
      amount: "1",
      currency: "USD",
      policyHash: "aa",
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: null,
      timestampMs: 1,
      nonce: "n".padEnd(16, "0"),
      prevReceiptHash: null,
      outcome: "aborted" as const,
    };
    assert.throws(() => signReceiptJson(claims, k.privateKeyPem, k.publicKeyPem), /lone-surrogate/);
    const rail = generateExtractKeys();
    assert.throws(
      () =>
        signRailExtract(
          { accountId: LONE, railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
          rail.privateKeyPem,
          rail.publicKeyPem,
        ),
      /lone-surrogate/,
    );
  });

  it("RED then GREEN: every verify surface answers false and does not throw", () => {
    const k = generateReceiptKeys();
    const rail = generateExtractKeys();
    const honest = signReceiptJson(
      {
        payer: "p",
        payee: "q",
        amount: "1",
        currency: "USD",
        policyHash: "aa",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: "ref-ok",
        timestampMs: 1,
        nonce: "n".padEnd(16, "0"),
        prevReceiptHash: null,
        outcome: "aborted",
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const jsonBad = { ...honest, claims: { ...honest.claims, payer: LONE } };
    const cose = signReceipt(honest.claims, k.privateKeyPem, k.publicKeyPem);
    const coseBad = { ...cose, claims: { ...cose.claims, payer: LONE } };
    const extract = signRailExtract(
      { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const extractBad = { ...extract, body: { ...extract.body, accountId: LONE } };
    const cp = signCheckpoint(
      {
        epoch: 0,
        startMs: 0,
        endMs: 10,
        receiptCount: 0,
        chainHeadHash: null,
        totals: {},
        prevCheckpointHash: null,
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const cpBad = { ...cp, claims: { ...cp.claims, chainHeadHash: LONE } };
    const manifest = signManifest(
      {
        description: "d",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        cancelCondition: "none",
        expiresAtMs: 9_000_000_000_000,
        ap2MandateHash: null,
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const manifestBad = { ...manifest, body: { ...manifest.body, description: LONE } };
    const token = signDecisionToken(
      { requestHash: "aa", policyHash: "bb", expiryMs: 9e12, nonce: "n", singleUseId: "s" },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const tokenBad = { ...token, claims: { ...token.claims, requestHash: LONE } };
    const inclusion = {
      statementHash: LONE,
      index: 0,
      treeHead: "bb",
      issuerPublicKeyPem: k.publicKeyPem,
      coseHex: "00",
    };

    assert.equal(verifyReceiptJson(jsonBad), false);
    assert.equal(verifyReceipt(jsonBad), false);
    assert.equal(verifyReceipt(coseBad), false);
    assert.equal(verifyRailExtract(extractBad), false);
    assert.equal(verifyCheckpoint(cpBad), false);
    assert.equal(verifyManifest(manifestBad), false);
    assert.equal(verifyDecisionToken(tokenBad, 1), false);
    assert.equal(verifyCounterSignature({ ...cose, counterCoseHex: "00", payeePublicKeyPem: k.publicKeyPem }), false);
    assert.equal(verifyInclusionReceipt(inclusion as never), false);
    assert.doesNotThrow(() => findCheckpointChainBreak([cpBad]));
    assert.doesNotThrow(() => findEquivocation([cpBad]));

    const session = new CedulonSession({ statePath: null });
    assert.doesNotThrow(() => session.verify({ receipt: jsonBad }));
    const verified = session.verify({ receipt: jsonBad });
    assert.equal(verified.ok, false);
    assert.equal(verified.receipt, false);

    const report = audit({
      receipts: [jsonBad, { ...jsonBad, claims: { ...jsonBad.claims, nonce: "n2".padEnd(16, "0"), prevReceiptHash: "x" } }],
      checkpoints: [cpBad],
      extract: extractBad,
      manifest: manifestBad,
    });
    assert.ok(report, "audit must return a report");
    assert.equal(jcsEncodeRefusal(jsonBad.claims), "lone-surrogate");
    assert.equal(jcsEncodeRefusal(extractBad.body), "lone-surrogate");
  });
});
