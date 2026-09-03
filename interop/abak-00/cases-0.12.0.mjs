// Cedulon audit cases beyond the 1 September population probe.
// Written for the draft-abak-agent-control-delivery-evidence -01 review
// (3 September 2026). Runs the published @cedulon packages, not this tree:
//
//   mkdir cases && cd cases && npm init -y
//   npm i @cedulon/audit@0.12.0 @cedulon/receipts@0.12.0 @cedulon/checkpoint@0.12.0 @cedulon/x402-adapter@0.12.0
//   node cases-0.12.0.mjs
//
// Replace 0.12.0 with 0.8.0 to reproduce the older column of the review.
// Each case prints the report fields the review quoted: ok, guarantee,
// summary, counts (absent at 0.8.0), scope, findings and warnings.
// The setup helpers are copied verbatim from population-probe.mjs so the
// two files stay independent; neither imports the other.

// Cedulon disposition mapping and population-conservation probe.
//
// A worked example from a shipped reconciler in an adjacent domain. It is not
// an implementation of draft-abak-agent-control-delivery-evidence-00, and it is
// not offered as one. What it does is take that draft's Section 6 vocabulary
// and apply it to a settlement reconciler that was written without it, to see
// what the rules find.
//
// Runs against the published packages, not against a working tree. Copy this
// file into an empty directory OUTSIDE this repository first: run from inside
// the workspace and the four imports resolve to the packages in the tree
// rather than to the published 0.8.0, which is the opposite of what it claims
// to measure. From that empty directory:
//
//   npm init -y
//   npm i @cedulon/audit@0.8.0 @cedulon/receipts@0.8.0 @cedulon/checkpoint@0.8.0 @cedulon/x402-adapter@0.8.0
//   node population-probe.mjs
//
// Every count it reports is computed from the package it imported rather than
// quoted from a document; the section labels and the draft references are of
// course written here. It exits non-zero when the set of finding codes the
// package exports is not the set this mapping covers. That catches a code
// added or removed. It does not catch a code whose name stayed and whose
// meaning moved, which only re-reading the emitting site catches.

import { createHash } from "node:crypto";
import { audit, FINDING_CODES } from "@cedulon/audit";
import { generateReceiptKeys, signReceipt } from "@cedulon/receipts";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const line = (n = 74) => "-".repeat(n);
const head = (s) => { console.log(""); console.log(s); console.log(line()); };

const H = createHash("sha256").update("cedulon/abak-probe").digest("hex");
const NOW = 1_700_000_000_000;
const END = NOW + 3_600_000;
const MID = NOW + 1_800_000;
const CLOSING = END - 1;

const ik = generateReceiptKeys();
const rk = generateExtractKeys();

const receipt = (ref, nonce, o = {}) => signReceipt({
  payer: "payer",
  payee: o.payee ?? "payee-1",
  amount: o.amount ?? "1",
  currency: "USD",
  policyHash: H,
  manifestHash: null,
  noManifest: true,
  x402PaymentRef: o.outcome === "aborted" ? null : ref,
  timestampMs: o.ts ?? MID,
  nonce: nonce.padEnd(16, "-"),
  prevReceiptHash: null,
  outcome: o.outcome ?? "settled",
}, ik.privateKeyPem, ik.publicKeyPem);

const checkpoint = (receipts) => signCheckpoint(
  buildCheckpointClaims(1, receipts, NOW, END, null), ik.privateKeyPem, ik.publicKeyPem);

const extract = (settlements, ws = NOW, we = END) => signRailExtract({
  accountId: "acct", railId: "rail", windowStartMs: ws, windowEndMs: we, settlements,
}, rk.privateKeyPem, rk.publicKeyPem);

const S = (ref, o = {}) => ({
  ref, amount: o.amount ?? "1", currency: "USD", timestampMs: o.ts ?? MID,
  ...(o.beneficiary ? { beneficiary: o.beneficiary } : {}),
});

const PIN = {
  publicKeyPem: rk.publicKeyPem, accountId: "acct", railId: "rail",
  windowStartMs: NOW, windowEndMs: END,
};

const run = (receipts, settlements, extra = {}) => audit({
  receipts,
  checkpoints: [checkpoint(receipts)],
  extract: extract(settlements),
  issuerTrust: { publicKeyPem: ik.publicKeyPem },
  trust: PIN,
  ...extra,
});


const show = (name, r) => {
  const keys = Object.keys(r);
  console.log("");
  console.log("=== " + name);
  console.log("keys: " + keys.join(", "));
  const o = {};
  for (const k of keys) { if (!["findings", "warnings"].includes(k)) o[k] = r[k]; }
  console.log(JSON.stringify(o, null, 1).slice(0, 2600));
  console.log("findings: " + (r.findings.map((f) => f.code + (f.id ? "(" + f.id + ")" : "")).join(", ") || "(none)"));
  console.log("warnings: " + (r.warnings.map((w) => w.code + (w.id ? "(" + w.id + ")" : "")).join(", ") || "(none)"));
};

const r1 = receipt("r1", "n1");
show("d. balanced, full trust, window+scope declared", run([r1], [S("r1")]));
show("e. balanced, NO rail key, NO window, NO scope (trust omitted)", audit({
  receipts: [r1], checkpoints: [checkpoint([r1])], extract: extract([S("r1")]),
  issuerTrust: { publicKeyPem: ik.publicKeyPem },
}));
show("e2. balanced, rail key pinned, window+scope NOT declared", audit({
  receipts: [r1], checkpoints: [checkpoint([r1])], extract: extract([S("r1")]),
  issuerTrust: { publicKeyPem: ik.publicKeyPem }, trust: { publicKeyPem: rk.publicKeyPem },
}));
const nextWindow = extract([S("r-late", { ts: END })], END, END + 1_000);
show("b. closing-boundary receipt, next window names it", run([receipt("r-late", "n-late", { ts: CLOSING })], [], { nextExtract: nextWindow }));
show("c. aborted receipt (refused spend)", run([receipt("r-ab", "n-ab", { outcome: "aborted" })], []));
show("f. malformed issuer record (many-to-one)", run([(() => { const r = receipt("r8", "n8"); const c = structuredClone(r); c.claims.policyHash = "zz"; return c; })()], [S("r8")]));

const show2 = (name, r) => {
  console.log("");
  console.log("=== " + name);
  console.log("ok=" + r.ok + "  guarantee=" + r.guarantee + "  summary=" + JSON.stringify(r.summary));
  console.log("counts.receipts: " + JSON.stringify(r.counts && r.counts.receipts));
  console.log("counts.settlements: " + JSON.stringify(r.counts && r.counts.settlements));
  console.log("scope: " + JSON.stringify(r.scope));
  console.log("findings: " + (r.findings.map((f) => f.code + (f.id ? "(" + f.id + ")" : "")).join(", ") || "(none)"));
  console.log("warnings: " + (r.warnings.map((w) => w.code + (w.id ? "(" + w.id + ")" : "")).join(", ") || "(none)"));
};


const foreign = generateExtractKeys();
const foreignExtract = signRailExtract({
  accountId: "acct", railId: "rail", windowStartMs: NOW, windowEndMs: END, settlements: [S("r1")],
}, foreign.privateKeyPem, foreign.publicKeyPem);

show2("g. rail key pinned, extract signed by a DIFFERENT key (refused)", audit({
  receipts: [r1], checkpoints: [checkpoint([r1])], extract: foreignExtract,
  issuerTrust: { publicKeyPem: ik.publicKeyPem }, trust: PIN,
}));
show2("h. rail key pinned, NO extract supplied at all", audit({
  receipts: [r1], checkpoints: [checkpoint([r1])],
  issuerTrust: { publicKeyPem: ik.publicKeyPem }, trust: PIN,
}));
show2("i. no rail key, NO extract supplied at all", audit({
  receipts: [r1], checkpoints: [checkpoint([r1])],
  issuerTrust: { publicKeyPem: ik.publicKeyPem },
}));
show2("j. extract declares a DIFFERENT account than pinned", audit({
  receipts: [r1], checkpoints: [checkpoint([r1])],
  extract: signRailExtract({ accountId: "other", railId: "rail", windowStartMs: NOW, windowEndMs: END, settlements: [S("r1")] }, rk.privateKeyPem, rk.publicKeyPem),
  issuerTrust: { publicKeyPem: ik.publicKeyPem }, trust: PIN,
}));
