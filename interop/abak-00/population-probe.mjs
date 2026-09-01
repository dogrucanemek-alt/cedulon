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

// ---------------------------------------------------------------------------
// PART 1. The mapping.
//
// Section 6.1 gives seven per-instruction dispositions plus ORPHAN on the
// record side. This reconciler emits finding codes. The two are not the same
// kind of thing, and the mapping is where that shows: a disposition is one
// verdict per instruction, and a finding code is one observation, of which an
// instruction may attract several. Part 2 handles that. This part answers only
// the narrower question: for each code, which class of the model does it speak
// to, and where it speaks to none, why.
// ---------------------------------------------------------------------------

const I_CLASS = "instruction";   // partitions |I| in Section 6.3
const R_CLASS = "record";        // partitions |R| in Section 6.3
const EXCLUDED = "excluded";     // Section 6.3, exclusion reported with its rule
const EITHER = "either-side";    // the code alone does not fix which side the row is on
const ISSUER_EV = "issuer-evidence"; // issuer-side aggregate evidence, in neither |I| nor |R|
const NOT_DISP = "not-a-disposition";

const MAP = {
  // --- Section 6.1 instruction dispositions -------------------------------
  "receipt-without-settlement": [I_CLASS, "UNCONFIRMED",
    "an issuer-side spend receipt with no matching row on the rail extract at the cutoff"],
  "settlement-mismatch": [I_CLASS, "SUBSTITUTION",
    "same rail reference, different amount or currency: one identifier, two content bindings"],
  "beneficiary-mismatch": [I_CLASS, "SUBSTITUTION",
    "same reference, different payee; the content binding that moved is who was paid"],
  "equivocation": [I_CLASS, "CONFLICT",
    "one epoch with two distinct checkpoint hashes; the profile cannot resolve which is the record"],
  "delivery-mismatch": [I_CLASS, "CONFLICT",
    "an attributable countersignature and the manifest disagree about what was delivered"],
  "settled-without-ref": [I_CLASS, "INVALID",
    "a receipt claims settled and carries no rail reference: a required binding is absent"],
  "receipt-chain-break": [I_CLASS, "INVALID",
    "the hash chain does not run; the record fails native verification"],
  "countersign-bad": [NOT_DISP, "evidence-authenticity",
    "the payee countersignature does not verify; this reconciler warns and discards it as unattributable rather than invalidating the receipt it was appended to"],
  "malformed-amount": [EITHER, "INVALID",
    "amount is not the profile's grammar; the aggregate walk reads receipt amounts and settlement amounts through the same helper, so which side it lands on depends on the row"],
  "malformed-policy-hash": [I_CLASS, "INVALID", "policy hash is not the profile's grammar"],
  "malformed-request-hash": [I_CLASS, "INVALID", "request hash is not the profile's grammar"],
  "malformed-acceptance-criteria-hash": [I_CLASS, "INVALID", "acceptance criteria hash is malformed"],
  "malformed-manifest-hash": [I_CLASS, "INVALID", "manifest hash is malformed"],
  "malformed-receipt-hash": [I_CLASS, "INVALID", "receipt hash is malformed"],
  "malformed-prev-receipt-hash": [I_CLASS, "INVALID", "previous receipt hash is malformed"],
  "malformed-chain-head-hash": [I_CLASS, "INVALID", "chain head hash is malformed"],
  "malformed-prev-checkpoint-hash": [I_CLASS, "INVALID", "previous checkpoint hash is malformed"],
  "malformed-ap-two-mandate-hash": [I_CLASS, "INVALID", "mandate hash is malformed"],

  // --- Section 6.3 record side --------------------------------------------
  "settlement-without-receipt": [R_CLASS, "ORPHAN",
    "a rail settlement with no issuer-side receipt: a receiver record outside the declared issuer population"],
  "duplicate-ref": [EITHER, "DUPLICATE",
    "two rows claim the same rail reference; the same helper reports duplicate receipts and duplicate settlements, so which side it lands on depends on the row"],
  "checkpoint-total-mismatch": [ISSUER_EV, "issuer-aggregate-evidence",
    "the checkpoint totals do not match the receipts it covers; a checkpoint is issuer-side aggregate evidence rather than a receiver record, so this is not an invalid receiver record and its per-instruction effect needs a profile rule this reconciler does not state"],
  "checkpoint-head-mismatch": [ISSUER_EV, "issuer-aggregate-evidence",
    "the checkpoint head does not match the chain it claims to close; same side, same missing rule"],
  "witness-inclusion-invalid": [ISSUER_EV, "issuer-aggregate-evidence",
    "an inclusion receipt does not verify against the log it names; a transparency proof, not a receiver settlement row"],

  // --- Section 6.3 exclusion, reported with its rule -----------------------
  "boundary-deferred": [EXCLUDED, "EXCLUDED",
    "an unmatched row inside the clock-skew boundary; deferred rather than charged, and the rule and the row are both printed"],

  // --- Codes that are not instruction dispositions -------------------------
  // These are the interesting half. Each says something about whether the
  // population or the evidence stands at all, which Section 6.4 gates PASS on
  // but Section 6.1 has no class for. Reporting one of these as a disposition
  // would put a claim about the world where a claim about the report belongs.
  "window-coverage": [NOT_DISP, "population-not-established",
    "a receipt falls outside every checkpoint window: the population has a hole rather than a member with a verdict"],
  "unstated-audit-window": [NOT_DISP, "population-not-established",
    "the verifier declared no period, so the extract is free to define the period it reports on"],
  "unstated-audit-scope": [NOT_DISP, "population-not-established",
    "the verifier declared no account or no rail, so a second settlement path is outside the declared population and unmeasured"],
  "extract-scope-mismatch": [NOT_DISP, "population-not-established",
    "the extract covers a different account, rail or window than the one under audit"],
  "extract-settlement-mismatch": [NOT_DISP, "population-not-established",
    "the extract settlement rows disagree with the window it declares"],
  "counterparty-unbound": [NOT_DISP, "population-not-established",
    "no manifest states a payee and no reconciled row names a beneficiary, so ref, amount and currency are the whole of what ties these settlements to these receipts"],
  "unauthenticated-extract": [NOT_DISP, "evidence-authenticity",
    "the extract is unsigned, or a rail key was pinned and no extract was supplied at all; either way the completeness guarantee is conditional rather than any instruction being in doubt"],
  "unauthenticated-issuer": [NOT_DISP, "evidence-authenticity", "no issuer key pinned"],
  "unauthenticated-witness": [NOT_DISP, "evidence-authenticity", "no witness key pinned"],
  "unauthenticated-countersigner": [NOT_DISP, "evidence-authenticity", "no payee key pinned"],
  "unauthenticated-manifest": [NOT_DISP, "evidence-authenticity", "no manifest publisher key pinned"],
  "issuer-key-mismatch": [NOT_DISP, "evidence-authenticity", "signed by a key other than the pinned issuer key"],
  "countersign-key-mismatch": [NOT_DISP, "evidence-authenticity", "signed by a key other than the pinned payee key"],
  "extract-key-mismatch": [NOT_DISP, "evidence-authenticity", "signed by a key other than the pinned rail key"],
  "manifest-key-mismatch": [NOT_DISP, "evidence-authenticity", "signed by a key other than the pinned publisher key"],
  "carried-key-mismatch": [NOT_DISP, "evidence-authenticity",
    "the key an object carries is not the key it was verified against"],
  "trust-key-unreadable": [NOT_DISP, "evidence-authenticity", "a supplied trust root could not be read"],
  "countersign-missing": [NOT_DISP, "evidence-authenticity",
    "a payee key is pinned and no countersignature from that payee was approved for the receipt, which includes one that was presented and then discarded"],
  "witness-entry-unattributable": [NOT_DISP, "evidence-authenticity", "a log entry cannot be attributed"],
  "witness-inclusion-not-exercised": [NOT_DISP, "transparency-layer",
    "inclusion receipts were presented and no proof pair was, so log membership was not proven"],
  "checkpoint-not-anchored": [NOT_DISP, "transparency-layer", "the checkpoint was not anchored"],
  "checkpoint-withheld": [NOT_DISP, "transparency-layer", "a checkpoint in the range was not presented"],
  "checkpoint-totals-redacted": [NOT_DISP, "transparency-layer",
    "totals were signed away; the comparison was skipped and said so"],
  "manifest-covers-no-receipt": [NOT_DISP, "terms-layer",
    "a presented manifest names no receipt; its object is the terms, not a delivery identifier"],
  "manifest-terms-mismatch": [NOT_DISP, "terms-layer",
    "a receipt departs from the terms it points at; again the terms axis, not delivery"],
};

// A mapping written by hand against a list that moves is a stale claim waiting
// to happen. This is the guard, and it is why the file exits non-zero rather
// than printing a table that no longer covers the package it imported.
head("PART 1  Mapping coverage, checked against the imported package");
const mapped = new Set(Object.keys(MAP));
const codes = new Set(FINDING_CODES);
const missing = [...codes].filter((c) => !mapped.has(c));
const extra = [...mapped].filter((c) => !codes.has(c));
console.log("finding codes in @cedulon/audit as imported: " + codes.size);
console.log("codes covered by this mapping:              " + mapped.size);
console.log("unmapped codes:                             " + (missing.length === 0 ? "none" : missing.join(", ")));
console.log("mapped codes not in the package:            " + (extra.length === 0 ? "none" : extra.join(", ")));
if (missing.length > 0 || extra.length > 0) {
  console.log("");
  console.log("STALE: this mapping does not describe the package it was run with.");
  process.exit(1);
}

const byClass = {};
for (const [code, [kind, cls]] of Object.entries(MAP)) {
  const key = kind + " / " + cls;
  (byClass[key] ??= []).push(code);
}
console.log("");
for (const key of Object.keys(byClass).sort()) {
  console.log(String(byClass[key].length).padStart(3) + "  " + key);
}
const notDisp = Object.entries(MAP).filter(([, v]) => v[0] === NOT_DISP).length;
console.log("");
console.log("Read that column: of " + codes.size + " codes, " + notDisp +
  " carry no disposition on their own.");
console.log("That is weaker than saying they say nothing about an instruction.");
console.log("Some of them would force one - an unreadable trust root, a key");
console.log("that does not match - once a profile states the rule linking");
console.log("failed evidence to the instructions that leaned on it. This");
console.log("reconciler does not state that rule, so the code by itself leaves");
console.log("the disposition open. What each of them does report is whether the");
console.log("declared population or the evidence stands at all, and an aggregate");
console.log("axis that swallows that together with a per-instruction verdict");
console.log("loses which of the two failed.");

// ---------------------------------------------------------------------------
// PART 2. The selection rule.
//
// Section 6.2 permits a profile to select among duplicate or superseding
// RECORDS, and requires that the discarded alternatives and the selection rule
// stay reviewable. That is not the problem here, and this is not offered as
// what 6.2 asks for. The problem is next to it: one malformed receipt in this
// reconciler emits codes at the record, matching, chain, checkpoint and scope
// layers, so the native output is many-to-one against an instruction while a
// disposition is one verdict. Some precedence is therefore needed before any
// mapping can exist. The rule below is ours, stated so it can be argued with,
// and what it did not choose is printed rather than dropped.
// ---------------------------------------------------------------------------

const PRECEDENCE = ["INVALID", "CONFLICT", "SUBSTITUTION", "UNCONFIRMED", "EXPLICIT_FAILURE", "INDETERMINATE"];

function dispositionOf(codesForInstruction) {
  const classes = codesForInstruction
    .map((c) => MAP[c])
    .filter((m) => m && m[0] === I_CLASS)
    .map((m) => m[1]);
  for (const p of PRECEDENCE) {
    if (classes.includes(p)) {
      return { disposition: p, discarded: classes.filter((c) => c !== p) };
    }
  }
  return { disposition: "CONFIRMED", discarded: [] };
}

// ---------------------------------------------------------------------------
// PART 3. The population-conservation check, run.
// ---------------------------------------------------------------------------

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

head("PART 3  One row per Minimum Conformance Case, measured");

const rows = [
  ["matching issuer and receiver records", [receipt("r1", "n1")], [S("r1")], "CONFIRMED"],
  ["issuer record only at cutoff", [receipt("r2", "n2")], [], "UNCONFIRMED"],
  ["same identifier, different content binding", [receipt("r3", "n3")], [S("r3", { amount: "2" })], "SUBSTITUTION"],
  ["receiver record only", [], [S("r4")], "CONFIRMED"],
  ["malformed issuer record", [(() => {
    const r = receipt("r8", "n8");
    const c = structuredClone(r);
    c.claims.policyHash = "zz";
    return c;
  })()], [S("r8")], "INVALID"],
];

for (const [name, receipts, settlements, expected] of rows) {
  const report = run(receipts, settlements);
  const all = [...report.findings, ...report.warnings].map((f) => f.code);
  const { disposition, discarded } = dispositionOf(all);
  const orphans = report.findings.filter((f) => f.code === "settlement-without-receipt").length;
  console.log(name);
  console.log("   codes emitted : " + (all.length === 0 ? "(none)" : all.join(", ")));
  if (receipts.length === 0) {
    // Section 6.1: ORPHAN is not an instruction disposition, because there is
    // no corresponding expected issuer instruction to give a verdict about.
    console.log("   disposition   : none; there is no instruction to dispose of");
  } else {
    console.log("   disposition   : " + disposition +
      "   discarded: " + (discarded.length ? discarded.join(", ") : "none") +
      (disposition === expected ? "" : "   [expected " + expected + "]"));
  }
  console.log("   ORPHAN records: " + orphans);
}

console.log("");
console.log("Two things to read off those rows. counterparty-unbound appears in");
console.log("every one and is selected in none: no manifest names a payee and no");
console.log("reconciled row names a beneficiary, so nothing binds the");
console.log("counterparty. That is a statement about the population, not a");
console.log("verdict on any instruction. And the malformed row emits seven codes,");
console.log("one of them twice, across the record, matching, chain, checkpoint");
console.log("and scope layers, for a single instruction. That is why a mapping");
console.log("needs a precedence rule and not a lookup. Where two codes select");
console.log("the same class, as the two INVALIDs do here, there is nothing to");
console.log("discard and the line says so.");

// ---------------------------------------------------------------------------
// PART 4. Where the published report does not let a reader rebuild |I|.
//
// Section 6.3: records excluded before population construction MUST be reported
// with the exclusion rule and count, otherwise the completeness claim is not
// reproducible. This reconciler does that in one place and not in another. Both
// rows below leave this window's accounting: the first is a receiver record
// leaving |R| and says so with its rule, the second is an issuer instruction
// leaving |I| and is silent. Both report balanced.
// ---------------------------------------------------------------------------

head("PART 4  Three rows that leave this window's accounting; one names its rule");

// The control first, so the deferral below is visibly an exclusion and not a
// path that never charged anything in the first place.
const charged = run([], [S("r-mid")]);
console.log("control. the same unmatched row away from either boundary");
console.log("   summary : " + charged.summary);
console.log("   findings: " + (charged.findings.map((f) => f.code).join(", ") || "(none)"));

const deferred = run([], [S("r-open", { ts: NOW + 1 })]);
console.log("");
console.log("a. unmatched row inside the opening boundary");
console.log("   summary : " + deferred.summary);
console.log("   warnings: " + (deferred.warnings.map((w) => w.code).join(", ") || "(none)"));
console.log("   exclusion reported with its rule: " +
  (deferred.warnings.some((w) => w.code === "boundary-deferred") ? "yes" : "no"));
const bd = deferred.warnings.find((w) => w.code === "boundary-deferred");
if (bd) console.log("   rule as printed: " + bd.detail);

// The second control: the same closing-boundary receipt, with a next window
// that does not name its reference. If that hardens into a charge, then the
// silent case below really is an exclusion and not a row that was never
// counted in the first place.
const foreignNext = extract([S("someone-else", { ts: END })], END, END + 1_000);
const hardened = run([receipt("r-late", "n-late", { ts: CLOSING })], [], { nextExtract: foreignNext });
console.log("");
console.log("control. the same closing-boundary receipt, next window does not name it");
console.log("   summary : " + hardened.summary);
console.log("   findings: " + (hardened.findings.map((f) => f.code).join(", ") || "(none)"));

const nextWindow = extract([S("r-late", { ts: END })], END, END + 1_000);
const carried = run([receipt("r-late", "n-late", { ts: CLOSING })], [], { nextExtract: nextWindow });
console.log("");
console.log("b. the same receipt, next window does name it");
console.log("   summary : " + carried.summary);
console.log("   findings: " + (carried.findings.map((f) => f.code).join(", ") || "(none)"));
console.log("   warnings: " + (carried.warnings.map((w) => w.code).join(", ") || "(none)"));
console.log("   anything said about the excluded row: " +
  (carried.findings.some((f) => f.id === "n-late----------") ||
   carried.warnings.some((w) => w.id === "n-late----------" || w.id === "r-late") ? "yes" : "no"));

const aborted = run([receipt("r-ab", "n-ab", { outcome: "aborted" })], []);
console.log("");
console.log("c. an instruction that positively did not settle");
console.log("   summary : " + aborted.summary);
console.log("   findings: " + (aborted.findings.map((f) => f.code).join(", ") || "(none)"));
console.log("   the receipt is in the issuer population and appears in no class count.");

head("What the two identities need that this report does not carry");
console.log("|I| = Nconfirmed + Nexplicit_failure + Nunconfirmed + Nsubstitution");
console.log("    + Nconflict + Ninvalid + Nindeterminate");
console.log("");
console.log("|R| = Nmatched + Norphan + Nduplicate + Ninvalid_receiver");
console.log("");
console.log("The two exclusions sit on opposite sides of that pair, and only one");
console.log("of them is published. Case (a) drops a receiver record out of |R|");
console.log("and prints the rule it used, so a reader can still rebuild |R|.");
console.log("Case (b) drops an issuer instruction out of |I| and prints nothing,");
console.log("so a reader holding the report cannot tell whether |I| was 1 or 0.");
console.log("The behaviour is right in both: the row really does belong to the");
console.log("neighbouring window, and charging it here would be a false finding.");
console.log("What differs is only whether the exclusion is reportable, and the");
console.log("side that is silent is the side the completeness claim is about.");
console.log("");
console.log("Case (c) is the same shape again, without any exclusion: the");
console.log("instruction stays in the population and receives no class. It is");
console.log("correct for a refused spend to have no row on the extract, and it");
console.log("is also absent from the report, so nothing separates a window");
console.log("holding one refused spend from a window holding none. Whether it");
console.log("is EXPLICIT_FAILURE is a question this file does not answer:");
console.log("Section 6.1 wants a positive attributable failure observation");
console.log("scoped to an identified attempt and boundary, and an issuer-side");
console.log("aborted receipt is an issuer statement, not a receiver-side");
console.log("delivery observation. What is certain is only that the count is");
console.log("missing, whichever class it belongs in.");
console.log("");
console.log("This report publishes findings and an aggregate, not class counts.");
console.log("The last bullet of Section 6.4 is the requirement it does not meet.");
