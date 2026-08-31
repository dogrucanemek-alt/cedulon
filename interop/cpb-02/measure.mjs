// Runs the draft-mih-sokolov-scitt-payload-binding-02 vector suite through
// Cedulon's RFC 8785 encoder and compares digests. The vectors are fetched
// from the CPB repository at a pinned commit rather than vendored, because
// that repository carries no license file; nothing here copies them.
//
//   npm run build:packages && node interop/cpb-02/measure.mjs
//
// CEDULON_CORE_DIST may point at another built copy of @cedulon/core.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CPB_REPO = "action-state-group/scitt-payload-binding";
const CPB_COMMIT = "eba249c8518bbf417068fb911f7bafa66e214d12"; // main, 2026-08-30T23:14:30Z
const RAW = `https://raw.githubusercontent.com/${CPB_REPO}/${CPB_COMMIT}/vectors/`;

const KATS = [
  "01-basic", "02-null-removed", "03-empty-array-removed", "04-empty-object-removed",
  "05-absent-field", "06-nested-null-bottom-up", "07-nested-empty-array-bottom-up",
  "08-exclusion-set", "09-exclusion-before-normalization", "10-must-fail-float",
  "11-exact-decimal-string", "12-nfc-boundary-pass", "13-nfc-boundary-contrast",
  "14-nested-array-normalization", "15-must-fail-float-in-array",
  "16-must-fail-unsafe-int-in-array", "17-must-fail-large-int-in-array",
  "18-utf16-key-order", "19-rfc8785-sorting-example",
  "20-must-fail-identifier-trailing-newline", "21-must-fail-identifier-surrounding-whitespace",
  "22-exclusion-depth-top-level-only", "23-esc-control-char-value", "24-tab-control-char-value",
  "25-control-char-taxonomy", "26-control-key-code-unit-sort", "27-esc-uppercase-contrast",
  "28-tab-long-form-contrast", "29-control-key-escaped-sort-contrast", "30-deep-nesting",
  "31-nested-tool-schema", "32-must-fail-exponent", "33-large-safe-integer", "34-large-payload",
  "35-must-fail-negative-zero", "36-pass-zero", "37-must-fail-duplicate-key",
  "38-escaping-control-chars",
];
const DIFFS = ["diff-01-null-member", "diff-02-empty-object-member", "diff-03-empty-array-member", "diff-04-float-member"];

const here = dirname(fileURLToPath(import.meta.url));
const coreDist = process.env.CEDULON_CORE_DIST ?? resolve(here, "../../packages/core/dist/index.js");
const { canonical, jcsEncodeRefusal, jsonDuplicateMemberName } = await import(pathToFileURL(coreDist).href);

const sha = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
async function fetchText(path) {
  const r = await fetch(RAW + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.text();
}
function ours(input, excl) {
  const obj = typeof input === "string" ? JSON.parse(input) : JSON.parse(JSON.stringify(input));
  if (obj && typeof obj === "object" && !Array.isArray(obj)) for (const k of excl) delete obj[k];
  const refusal = jcsEncodeRefusal(obj);
  if (refusal) return { refusal };
  const pre = canonical(obj);
  return { pre, digest: sha(pre) };
}

const rows = [];
let plain = 0, plainMatch = 0, diffMatch = 0, rawDup = [];
for (const name of KATS) {
  const text = await fetchText(`jcs-n/kats/${name}.json`);
  const dup = jsonDuplicateMemberName(text);
  if (dup !== null) rawDup.push(`${name} (${JSON.stringify(dup)})`);
  const v = JSON.parse(text);
  if (v.input === undefined) { rows.push([v.id, "n/a: typed-reference representation vector", "-"]); continue; }
  const excl = v.exclusion_set ? (typeof v.exclusion_set === "string" ? JSON.parse(v.exclusion_set) : v.exclusion_set) : [];
  const o = ours(v.input, excl);
  if (v.must_fail) { rows.push([v.id, `MUST-FAIL under jcs-n: ${v.failure_reason}`, o.refusal ? `refused: ${o.refusal}` : `admitted under jcs: ${o.digest.slice(0, 12)}`]); continue; }
  const base = v.after_exclusion !== undefined ? v.after_exclusion : v.input;
  const normalizes = v.normalized !== undefined && JSON.stringify(v.normalized) !== JSON.stringify(base);
  if (normalizes) { rows.push([v.id, "jcs-n normalization applies", o.digest === v.digest ? "UNEXPECTED MATCH" : "differs, as jcs must"]); continue; }
  plain += 1;
  const match = o.digest === v.digest;
  if (match) plainMatch += 1;
  rows.push([v.id, "plain RFC 8785", match ? "MATCH" : `DIFF ${o.digest.slice(0, 12)} vs ${String(v.digest).slice(0, 12)}`]);
}
for (const name of DIFFS) {
  const v = JSON.parse(await fetchText(`subject-binding-diff/${name}.json`));
  const d = sha(canonical(v.action));
  const match = d === v.jcs.digest;
  if (match) diffMatch += 1;
  rows.push([v.id, "subject-binding-diff", `${match ? "MATCH jcs" : "DIFF jcs"}; ${d === v.jcs_n.digest ? "equals jcs-n (unexpected)" : "differs from jcs-n, as designed"}`]);
}
const w = [40, 46];
for (const r of rows) console.log(r.map((c, i) => String(c).padEnd(w[i] ?? 0)).join(" | "));
console.log(`\nCPB ${CPB_REPO}@${CPB_COMMIT.slice(0, 7)}: plain-RFC-8785 known-answer vectors ${plainMatch}/${plain} match; subject-binding-diff ${diffMatch}/${DIFFS.length} match jcs`);
console.log(`raw vector files carrying a duplicate member name: ${rawDup.length === 0 ? "none" : rawDup.join(", ")}`);
process.exitCode = plainMatch === plain && diffMatch === DIFFS.length ? 0 : 1;
