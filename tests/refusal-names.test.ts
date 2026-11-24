/**
 * Appendix B says "The reference implementation uses these" over the
 * Refusal table. Until this file, nothing compared the two: cbor-eof,
 * cbor-trailing and cose-protected-header were thrown by the decoder and
 * dropped on the way to the report, so the table named three refusals no
 * report ever carried. The table is read from the living core draft here,
 * and both directions are checked against what the code names.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { audit, auditWindows } from "@cedulon/audit";
import { parseIJson } from "@cedulon/core";
import { NAMED_DECODE_REFUSALS } from "@cedulon/cose";
import { generateReceiptKeys, signReceipt, signReceiptJson, type SpendReceiptClaims } from "@cedulon/receipts";
import { EXTRACT_SCOPE_FIELDS, SETTLEMENT_CORE_FIELDS, railExtractTextRefusal } from "@cedulon/x402-adapter";

import { livingCoreDraftPath } from "../scripts/latest-draft.ts";
import { TEST_HASH } from "./hash-fixtures.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = livingCoreDraftPath(ROOT);
const SPEC = readFileSync(SPEC_PATH, "utf8");

/**
 * The first cell of every row under "| Refusal | Raised when |". A cell
 * may list a family: "missing-extract-accountId, -railId" is
 * missing-extract-accountId and missing-extract-railId.
 */
function appendixBRefusals(spec: string): string[] {
  const lines = spec.split(/\r?\n/);
  const header = lines.findIndex((l) => /^\|\s*Refusal\s*\|\s*Raised when\s*\|/.test(l));
  assert.notEqual(header, -1, "Appendix B has no | Refusal | Raised when | table");
  const names: string[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    const cell = line.split("|")[1]!.trim();
    const parts = cell.split(",").map((p) => p.trim());
    const first = parts[0]!;
    const stem = first.slice(0, first.lastIndexOf("-") + 1);
    for (const part of parts) {
      names.push(part.startsWith("-") ? stem + part.slice(1) : part);
    }
  }
  return names;
}

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function functionBody(text: string, signature: string): string {
  const start = text.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  const end = text.indexOf("\n}\n", start);
  return text.slice(start, end);
}

/**
 * Every name railExtractShapeRefusal can return. A return this does not
 * recognise fails the scan rather than being skipped, so a new branch
 * cannot add a name the comparison never sees.
 */
function extractShapeRefusals(): Set<string> {
  const body = functionBody(source("packages/x402-adapter/src/rail.ts"), "export function railExtractShapeRefusal(");
  const lists: Record<string, readonly string[]> = { EXTRACT_SCOPE_FIELDS, SETTLEMENT_CORE_FIELDS };
  const names = new Set<string>();
  for (const m of body.matchAll(/return ([^;]+);/g)) {
    const expr = m[1]!;
    if (expr === "null") continue;
    const literal = /^"([a-z][A-Za-z0-9-]*)"$/.exec(expr);
    if (literal) {
      names.add(literal[1]!);
      continue;
    }
    const template = /^`([a-z-]+)\$\{field\}`$/.exec(expr);
    assert.ok(template, `railExtractShapeRefusal returns ${expr}, which this scan cannot name`);
    const loops = [...body.slice(0, m.index).matchAll(/for \(const field of (\w+)\)/g)];
    const list = lists[loops.at(-1)?.[1] ?? ""];
    assert.ok(list, `the loop around ${expr} walks a list this scan does not know`);
    for (const field of list) names.add(template[1]! + field);
  }
  return names;
}

/** What canonical() throws, which jcsEncodeRefusal passes into the report. */
function encoderRefusals(): Set<string> {
  const text = source("packages/core/src/canonical.ts");
  const names = new Set<string>();
  for (const m of text.matchAll(/new Error\("([^"]+)"\)/g)) names.add(m[1]!);
  for (const m of text.matchAll(/: "([a-z][a-z-]*)";/g)) names.add(m[1]!);
  return names;
}

function implementationRefusals(): Set<string> {
  const names = new Set<string>([...NAMED_DECODE_REFUSALS, ...extractShapeRefusals(), ...encoderRefusals()]);
  for (const m of source("packages/audit/src/index.ts").matchAll(/refused: (receipt-not-cose) -/g)) {
    names.add(m[1]!);
  }
  return names;
}

/**
 * Names the code raises that the table does not list. Each one is a
 * question for the draft, not for this file, and the list is held exact:
 * a name that joins the table, or leaves the code, has to leave this list
 * in the same change.
 */
const UNLISTED_IN_APPENDIX_B = new Set([
  // A body that is not an object. null is the fixed unreadable-input
  // report; 5, "x" and true reach the report under this name.
  "missing-extract-body",
  // canonical() on a value RFC 8785 cannot encode. JSON.parse("1e309")
  // is Infinity, so presented text reaches it.
  "non-finite number",
  // canonical() on a value JSON text cannot produce.
  "unencodable",
]);

const CLAIMS: SpendReceiptClaims = {
  payer: "payer-1",
  payee: "payee-1",
  amount: "1",
  currency: "USD",
  policyHash: TEST_HASH,
  manifestHash: null,
  noManifest: true,
  x402PaymentRef: null,
  timestampMs: 1_700_000_000_000,
  nonce: "n1".padEnd(16, "0"),
  prevReceiptHash: null,
  outcome: "aborted",
};
const KEYS = generateReceiptKeys();
const SIGNED = signReceipt(CLAIMS, KEYS.privateKeyPem, KEYS.publicKeyPem);
const BODY = { accountId: "a", railId: "r", windowStartMs: 1, windowEndMs: 2, settlements: [] as unknown[] };
const ROW = { ref: "ref-1", amount: "1", currency: "USD", timestampMs: 1 };

function without<T extends object>(value: T, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  delete copy[key];
  return copy;
}

/** Every detail the report carries, findings and warnings alike. */
function reportTexts(input: unknown): string[] {
  const report = audit(input as never);
  return [...report.findings, ...report.warnings].map((f) => `${f.code}: ${f.detail}`);
}

function receiptCose(coseHex: string): string[] {
  return reportTexts({ receipts: [{ ...SIGNED, coseHex }], checkpoints: [] });
}

function extractBody(body: unknown): string[] {
  return reportTexts({ receipts: [], checkpoints: [], extract: { body, signature: "x", publicKeyPem: "y" } });
}

function thrown(fn: () => unknown): string[] {
  try {
    fn();
    return [];
  } catch (err) {
    return [err instanceof Error ? err.message : String(err)];
  }
}

/** One or more bad inputs per table name; each has to come back naming it. */
const VECTORS: Record<string, Array<() => string[]>> = {
  "cbor-too-large": [() => receiptCose("00".repeat(70_000))],
  "cbor-too-deep": [() => receiptCose("81".repeat(20) + "00")],
  // The signature string declares 64 octets and carries 63.
  "cbor-eof": [() => receiptCose(SIGNED.coseHex!.slice(0, -2)), () => receiptCose("84")],
  "cbor-trailing": [() => receiptCose(SIGNED.coseHex! + "00")],
  // Protected header h'a20101 0102' is {1:1, 1:2}.
  "cbor-duplicate-key": [() => receiptCose("8445a201010102a041004100")],
  // The outer array of four written with a one-octet length argument.
  "cbor-non-deterministic": [() => receiptCose("9804" + SIGNED.coseHex!.slice(2))],
  // A text string carrying the lone octet 0xff.
  "cbor-invalid-text": [() => receiptCose("8440a10161ff4040")],
  "cose-protected-header": [
    // {1: -8}: no content type and no kid.
    () => receiptCose("8443a10127a04040"),
    // An empty array where the header map belongs.
    () => receiptCose("844180a04040"),
  ],
  "cose-sign1-unprotected": [() => receiptCose("8440a101014040")],
  "json-duplicate-key": [
    () => [railExtractTextRefusal('{"body":{"accountId":"a","accountId":"b"}}') ?? ""],
    () => thrown(() => parseIJson('{"a":1,"a":2}')),
  ],
  "receipt-not-cose": [
    () => reportTexts({ receipts: [signReceiptJson(CLAIMS, KEYS.privateKeyPem, KEYS.publicKeyPem)], checkpoints: [] }),
  ],
  "lone-surrogate": [
    () => extractBody({ ...BODY, accountId: "\uDEAD" }),
    () => extractBody({ ...BODY, railId: "r\uD800r" }),
  ],
  "malformed-extract-windowStartMs": [() => extractBody({ ...BODY, windowStartMs: 1.5 })],
  "malformed-extract-windowEndMs": [() => extractBody({ ...BODY, windowEndMs: 2.5 })],
  "malformed-extract-window": [() => extractBody({ ...BODY, windowStartMs: 2, windowEndMs: 2 })],
  "malformed-extract-clockSkewMs": [() => extractBody({ ...BODY, clockSkewMs: -1 })],
  "malformed-settlement-timestampMs": [() => extractBody({ ...BODY, settlements: [{ ...ROW, timestampMs: 1.5 }] })],
  "malformed-settlement-beneficiary": [() => extractBody({ ...BODY, settlements: [{ ...ROW, beneficiary: 5 }] })],
};
for (const field of EXTRACT_SCOPE_FIELDS) {
  VECTORS[`missing-extract-${field}`] = [() => extractBody(without(BODY, field))];
}
for (const field of SETTLEMENT_CORE_FIELDS) {
  VECTORS[`renamed-settlement-${field}`] = [() => extractBody({ ...BODY, settlements: [without(ROW, field)] })];
}

function names(texts: string[], name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return texts.some((t) => new RegExp(`(^|refused: )${escaped}( -|$)`).test(t));
}

describe("Appendix B refusals are the names the reports carry", () => {
  const table = appendixBRefusals(SPEC);

  it("the table is read, and every name on it has a bad input here", () => {
    assert.ok(table.length >= 20, `read only ${table.length} names from Appendix B`);
    assert.equal(new Set(table).size, table.length, "Appendix B lists a name twice");
    assert.deepEqual(
      table.filter((n) => VECTORS[n] === undefined),
      [],
      "a table name with no bad input here is a name nothing checks",
    );
  });

  for (const name of table) {
    it(`RED then GREEN: ${name} reaches the report by name`, () => {
      const vectors = VECTORS[name] ?? [];
      assert.ok(vectors.length > 0, `no bad input for ${name}`);
      vectors.forEach((vector, i) => {
        const texts = vector();
        assert.ok(names(texts, name), `${name} vector ${i}: the report said ${JSON.stringify(texts)}`);
      });
    });
  }

  it("RED then GREEN: the table and the code name the same refusals, both ways", () => {
    const code = implementationRefusals();
    const listed = new Set(table);
    const notInCode = table.filter((n) => !code.has(n)).sort();
    const notInTable = [...code].filter((n) => !listed.has(n) && !UNLISTED_IN_APPENDIX_B.has(n)).sort();
    assert.deepEqual(notInCode, [], `Appendix B lists refusals no report carries: ${notInCode.join(", ")}`);
    assert.deepEqual(notInTable, [], `the code names refusals Appendix B does not list: ${notInTable.join(", ")}`);
    const stale = [...UNLISTED_IN_APPENDIX_B].filter((n) => listed.has(n) || !code.has(n)).sort();
    assert.deepEqual(stale, [], `UNLISTED_IN_APPENDIX_B is out of date: ${stale.join(", ")}`);
  });
});

describe("an input the verifier cannot read at all is not a refusal of one object", () => {
  const SENTENCE =
    "An audit input or a verifier configuration that the verifier cannot read at all is not a refusal of one object: " +
    "the audit is not carried out, and the report fails with `presented-object-malformed` as its only finding.";

  it("the Finding codes section says so", () => {
    assert.ok(SPEC.replace(/\s+/g, " ").includes(SENTENCE), `${SPEC_PATH} no longer carries the sentence`);
  });

  it("an unreadable input or configuration fails with that one finding", () => {
    const extract = { body: BODY, signature: "x", publicKeyPem: "y" };
    const unreadable: Array<[string, unknown]> = [
      ["null input", null],
      ["number input", 5],
      ["receipts absent", { checkpoints: [] }],
      ["receipt null", { receipts: [null], checkpoints: [] }],
      ["settlements not a list", { receipts: [], checkpoints: [], settlements: 5 }],
      ["issuer pin with no key", { receipts: [], checkpoints: [], issuerTrust: {} }],
      ["rail pin not text", { receipts: [], checkpoints: [], extract, trust: { publicKeyPem: [1] } }],
    ];
    for (const [label, input] of unreadable) {
      const report = audit(input as never);
      assert.equal(report.ok, false, label);
      assert.notEqual(report.guarantee, "unconditional", label);
      assert.deepEqual(report.findings.map((f) => f.code), ["presented-object-malformed"], label);
      assert.deepEqual(report.warnings, [], label);
    }
    const run = auditWindows({ windows: [null as never] });
    assert.equal(run.ok, false);
    assert.deepEqual(run.findings.map((f) => f.code), ["presented-object-malformed"]);
  });

  it("a refused object is reported by its name, and the audit still runs", () => {
    const texts = receiptCose("00".repeat(70_000));
    assert.ok(names(texts, "cbor-too-large"));
    assert.equal(texts.some((t) => t.startsWith("presented-object-malformed")), false);
  });
});
