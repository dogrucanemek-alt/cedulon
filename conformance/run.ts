import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { audit } from "@cedulon/audit";
import { buildCheckpointClaims, checkpointHash, signCheckpoint } from "@cedulon/checkpoint";
import { parseIJson, requestHashOf } from "@cedulon/core";
import {
  generateManifestKeys,
  manifestHash,
  signManifest,
} from "@cedulon/manifest";
import { generateReceiptKeys, receiptHash, signReceipt } from "@cedulon/receipts";
import { generateExtractKeys, railExtractTextRefusal, signRailExtract } from "@cedulon/x402-adapter";
import { latestDraftPath } from "../scripts/latest-draft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The COSE_Sign1 hex blocks of the living draft's Appendix A, whitespace
 * removed, in document order. A sha256-of-hex vector must carry one of them:
 * the draft is the source of the bytes, and the vector file is not allowed
 * to become a second, drifting copy of it.
 */
function appendixCoseHexBlocks(): string[] {
  const md = readFileSync(latestDraftPath(root), "utf8");
  return [...md.matchAll(/COSE_Sign1 hex \(whitespace ignored\):\s*~~~~\s*([0-9a-f\s]+?)~~~~/g)].map((m) =>
    m[1]!.replace(/\s+/g, ""),
  );
}

export type Vector = {
  id: string;
  must: string;
  draft: string;
  kind: string;
  hex?: string;
  windowStartMs?: number;
  windowEndMs?: number;
  timestampMs?: number;
  expectFinding?: string | null;
  expectNoFinding?: string;
  expectWarning?: string;
  expectRefuse?: boolean;
  claims?: Record<string, unknown>;
  receiptAmount?: string;
  manifestAmount?: string;
  signWith?: string;
  pinIssuer?: boolean;
  bindReceipt?: boolean;
  draftNamesDigest?: boolean;
  draftOpen?: boolean;
  /** Only meaningful once draftNamesDigest is true; see the request-hash branch. */
  expectRequestHash?: string;
  text?: string;
  doc?: string;
  side?: "record" | "row";
  clockSkewMs?: number;
  receiptTimestampMs?: number;
  adjacent?: "previous" | "next";
  rowTimestampMs?: number | null;
  rowAmount?: string;
  expectCarried?: boolean;
  anchor?: "absent" | "valid" | "foreign-key" | "epoch-off";
  expectOk?: boolean;
  expectId?: string;
};

export type Row = { id: string; status: "pass" | "split" | "error"; detail: string };

const NOW = 1_700_000_000_000;

export function loadVectors(): Vector[] {
  // The vector file is evidence about the draft, so it goes through the same
  // I-JSON gate as protocol text: a duplicated member in it would otherwise
  // pick the last value silently and the runner would measure the wrong bytes.
  const spec = parseIJson(readFileSync(join(root, "conformance", "vectors.json"), "utf8")) as {
    vectors: Vector[];
  };
  return spec.vectors;
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** SHA-256("cedulon/test-policy") — a real digest, not a placeholder. */
const TEST_POLICY_HASH = sha256Hex(Buffer.from("cedulon/test-policy"));
const EMPTY_DELIVERY_HASH = sha256Hex(Buffer.alloc(0));

function baseClaims() {
  return {
    payer: "payer",
    payee: "payee",
    amount: "1",
    currency: "USD",
    policyHash: TEST_POLICY_HASH,
    manifestHash: null as string | null,
    noManifest: true,
    x402PaymentRef: null as string | null,
    timestampMs: NOW,
    nonce: "n0".padEnd(16, "-"),
    prevReceiptHash: null,
    outcome: "aborted" as const,
  };
}

const EDGE_REF = "edge-ref";
const EDGE_HOUR = 3_600_000;

function edgeReceipt(
  issuer: ReturnType<typeof generateReceiptKeys>,
  timestampMs: number,
  over: { ref?: string; nonce?: string; prev?: string | null } = {},
) {
  return signReceipt(
    {
      ...baseClaims(),
      amount: "1",
      currency: "USD",
      x402PaymentRef: over.ref ?? EDGE_REF,
      timestampMs,
      nonce: (over.nonce ?? "n0").padEnd(16, "-"),
      prevReceiptHash: over.prev ?? null,
      outcome: "settled",
    },
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
}

function edgeExtract(
  rail: ReturnType<typeof generateExtractKeys>,
  windowStartMs: number,
  windowEndMs: number,
  clockSkewMs: number,
  settlements: Array<{ ref: string; timestampMs: number; amount?: string }>,
) {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs,
      windowEndMs,
      clockSkewMs,
      settlements: settlements.map((row) => ({
        ref: row.ref,
        amount: row.amount ?? "1",
        currency: "USD",
        timestampMs: row.timestampMs,
      })),
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function edgePins(
  rail: ReturnType<typeof generateExtractKeys>,
  issuer: ReturnType<typeof generateReceiptKeys>,
  windowStartMs: number,
  windowEndMs: number,
) {
  return {
    trust: {
      publicKeyPem: rail.publicKeyPem,
      accountId: "acct",
      railId: "rail",
      windowStartMs,
      windowEndMs,
    },
    issuerTrust: { publicKeyPem: issuer.publicKeyPem },
  };
}

export function evaluateVectors(vectors: Vector[]): Row[] {
  const rows: Row[] = [];
  for (const v of vectors) {
    try {
    if (v.kind === "sha256-of-hex") {
      // The check used to hash whatever hex the vector carried and compare it
      // with the companion hashing the same octets: a tautology that stayed
      // green while the vector bytes drifted two revisions behind the draft.
      // The octets are only evidence when they are the posted draft's own
      // Appendix A bytes, so that is asserted first, against the draft text.
      const appendix = appendixCoseHexBlocks();
      if (!appendix.includes(v.hex!)) {
        rows.push({
          id: v.id,
          status: "error",
          detail: `vector hex (${v.hex!.length} chars) is not one of the ${appendix.length} COSE_Sign1 hex blocks in the draft's Appendix A`,
        });
        continue;
      }
      const bytes = Buffer.from(v.hex!, "hex");
      const digest = sha256Hex(bytes);
      const ours =
        v.id.includes("manifest")
          ? manifestHash({
              body: {
                description: "x",
                amount: "1",
                currency: "USD",
                acceptanceCriteriaHash: EMPTY_DELIVERY_HASH,
                cancelCondition: "none",
                expiresAtMs: NOW,
              },
              encoding: "cose",
              coseHex: v.hex!,
              signature: "",
              publicKeyPem: "",
            })
          : receiptHash({
              claims: baseClaims(),
              signature: "",
              publicKeyPem: "",
              encoding: "cose",
              coseHex: v.hex!,
            });
      if (ours !== digest) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `draft SHA-256 of published COSE is ${digest}; companion returned ${ours}`,
        });
      } else {
        rows.push({ id: v.id, status: "pass", detail: `SHA-256 of Appendix A COSE = ${digest}` });
      }
      continue;
    }

    if (v.kind === "extract-scope") {
      const rail = generateExtractKeys();
      const extract = signRailExtract(
        {
          accountId: "acct",
          railId: "rail",
          windowStartMs: v.windowStartMs!,
          windowEndMs: v.windowEndMs!,
          settlements: [
            { ref: "r1", amount: "1", currency: "USD", timestampMs: v.timestampMs! },
          ],
        },
        rail.privateKeyPem,
        rail.publicKeyPem,
      );
      const report = audit({
        receipts: [],
        checkpoints: [],
        extract,
        trust: {
          publicKeyPem: rail.publicKeyPem,
          accountId: "acct",
          railId: "rail",
          windowStartMs: v.windowStartMs,
          windowEndMs: v.windowEndMs,
        },
      });
      const hit = report.findings.some((f) => f.code === "extract-scope-mismatch");
      const wanted = v.expectFinding === "extract-scope-mismatch";
      if (hit !== wanted) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `draft expects extract-scope-mismatch=${wanted}; companion ${hit} findings=${report.findings.map((f) => f.code).join(",") || "none"}`,
        });
      } else {
        rows.push({ id: v.id, status: "pass", detail: `extract-scope-mismatch=${hit}` });
      }
      continue;
    }

    if (v.kind === "sign-refuse") {
      const keys = generateReceiptKeys();
      const claims = { ...baseClaims(), ...v.claims };
      let refused = false;
      try {
        signReceipt(claims, keys.privateKeyPem, keys.publicKeyPem);
      } catch {
        refused = true;
      }
      if (refused !== Boolean(v.expectRefuse)) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `draft requires refuse=${v.expectRefuse}; companion refused=${refused}`,
        });
      } else {
        rows.push({ id: v.id, status: "pass", detail: `sign refused=${refused}` });
      }
      continue;
    }

    if (v.kind === "terms-mismatch") {
      const honest = generateReceiptKeys();
      const signer = v.signWith === "attacker" ? generateReceiptKeys() : honest;
      const manifestKeys = generateManifestKeys();
      const manifest = signManifest(
        {
          description: "vec",
          amount: v.manifestAmount ?? "1",
          currency: "USD",
          acceptanceCriteriaHash: EMPTY_DELIVERY_HASH,
          cancelCondition: "none",
          expiresAtMs: NOW + 60_000,
        },
        manifestKeys.privateKeyPem,
        manifestKeys.publicKeyPem,
      );
      const receipt = signReceipt(
        {
          ...baseClaims(),
          amount: v.receiptAmount ?? "99",
          manifestHash: manifestHash(manifest),
          noManifest: false,
          x402PaymentRef: "ref-ok",
          outcome: "settled",
        },
        signer.privateKeyPem,
        signer.publicKeyPem,
      );
      const report = audit({
        receipts: [receipt],
        checkpoints: [],
        manifest,
        manifestTrust: { publicKeyPem: manifestKeys.publicKeyPem },
        issuerTrust: v.pinIssuer ? { publicKeyPem: honest.publicKeyPem } : undefined,
      });
      const findingCodes: string[] = report.findings.map((f) => f.code);
      const warningCodes: string[] = report.warnings.map((w) => w.code);
      const problems: string[] = [];
      if (typeof v.expectFinding === "string" && !findingCodes.some((c) => c === v.expectFinding)) {
        problems.push(`missing finding ${v.expectFinding}`);
      }
      if (v.expectNoFinding && findingCodes.some((c) => c === v.expectNoFinding)) {
        problems.push(`unexpected finding ${v.expectNoFinding}`);
      }
      if (v.expectWarning) {
        const warning = report.warnings.find((w) => w.code === v.expectWarning);
        if (!warning) {
          problems.push(`missing warning ${v.expectWarning}`);
        } else if (warning.severity !== "warn") {
          problems.push(`warning ${v.expectWarning} severity=${warning.severity}`);
        }
      }
      if (v.pinIssuer === false && !warningCodes.includes("unauthenticated-issuer")) {
        problems.push("missing warning unauthenticated-issuer");
      }
      if (problems.length > 0) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `${problems.join("; ")}; findings=${findingCodes.join(",") || "none"} warnings=${warningCodes.join(",") || "none"}`,
        });
      } else if (v.draftOpen === true) {
        const said = [
          typeof v.expectFinding === "string" ? `found ${v.expectFinding}` : "",
          v.expectNoFinding ? `no finding ${v.expectNoFinding}` : "",
          v.expectWarning ? `warning ${v.expectWarning}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        rows.push({
          id: v.id,
          status: "split",
          detail: `${said}; companion matched its own recording; posted draft still states a single branch that fails the audit`,
        });
      } else {
        const said = [
          typeof v.expectFinding === "string" ? `found ${v.expectFinding}` : "",
          v.expectNoFinding ? `no finding ${v.expectNoFinding}` : "",
          v.expectWarning ? `warning ${v.expectWarning}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        rows.push({ id: v.id, status: "pass", detail: said || "terms vector matched" });
      }
      continue;
    }

    if (v.kind === "cover-warning") {
      const honest = generateReceiptKeys();
      const manifestKeys = generateManifestKeys();
      const manifest = signManifest(
        {
          description: "vec",
          amount: "1",
          currency: "USD",
          acceptanceCriteriaHash: EMPTY_DELIVERY_HASH,
          cancelCondition: "none",
          expiresAtMs: NOW + 60_000,
        },
        manifestKeys.privateKeyPem,
        manifestKeys.publicKeyPem,
      );
      const receipt = signReceipt(
        {
          ...baseClaims(),
          manifestHash: v.bindReceipt ? manifestHash(manifest) : null,
          noManifest: !v.bindReceipt,
          x402PaymentRef: "ref-ok",
          outcome: "settled",
        },
        honest.privateKeyPem,
        honest.publicKeyPem,
      );
      const report = audit({
        receipts: [receipt],
        checkpoints: [],
        manifest,
        manifestTrust: { publicKeyPem: manifestKeys.publicKeyPem },
        issuerTrust: { publicKeyPem: honest.publicKeyPem },
      });
      const hit = report.warnings.some((w) => w.code === v.expectWarning);
      if (!hit) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `draft requires warning ${v.expectWarning}; companion warnings=${report.warnings.map((w) => w.code).join(",") || "none"}`,
        });
      } else {
        rows.push({ id: v.id, status: "pass", detail: `found ${v.expectWarning}` });
      }
      continue;
    }

    if (v.kind === "request-hash") {
      if (v.draftNamesDigest !== true && v.draftNamesDigest !== false) {
        rows.push({
          id: v.id,
          status: "error",
          detail: "request-hash vector must set draftNamesDigest",
        });
        continue;
      }
      const req = {
        amount: 1n,
        currency: "USD",
        payee: "payee",
        nonce: "n0".padEnd(16, "-"),
        nowMs: NOW,
        tool: "spend",
      };
      const bound = requestHashOf(req);
      if (v.draftNamesDigest === true) {
        // The posted draft now names the digest, the encoding and the exact
        // member-by-member shape of the request document, so a reader can
        // compute this value from the text alone. That is what licenses an
        // expected digest here: while the draft was silent, writing one would
        // have recorded the companion's answer as though it were the draft's.
        if (typeof v.expectRequestHash !== "string") {
          rows.push({
            id: v.id,
            status: "error",
            detail:
              "draftNamesDigest is true, so the posted draft names the digest and this vector must carry the expected value",
          });
          continue;
        }
        if (v.expectRequestHash !== bound) {
          rows.push({
            id: v.id,
            status: "split",
            detail: `draft-derived digest ${v.expectRequestHash}; companion binds ${bound}`,
          });
          continue;
        }
        rows.push({
          id: v.id,
          status: "pass",
          detail: `companion binds the digest the posted draft defines (${bound})`,
        });
        continue;
      }
      rows.push({
        id: v.id,
        status: "split",
        detail: `companion binds SHA-256 of the six-field canonical JSON (lowercase hex ${bound}); posted draft names a hash of the request fields but not the octets or the digest`,
      });
      continue;
    }

    if (v.kind === "scope-warning") {
      const rail = generateExtractKeys();
      const windowEndMs = NOW + 3_600_000;
      const extract = signRailExtract(
        {
          accountId: "acct-1",
          railId: "rail-a",
          windowStartMs: NOW,
          windowEndMs,
          settlements: [],
        },
        rail.privateKeyPem,
        rail.publicKeyPem,
      );
      // The pin carries everything the posted draft asks a verifier to state:
      // the rail key and the period under audit. It says nothing about which
      // account, or which of that account's rails, the result is about.
      const report = audit({
        receipts: [],
        checkpoints: [],
        extract,
        trust: { publicKeyPem: rail.publicKeyPem, windowStartMs: NOW, windowEndMs },
      });
      const warned = report.warnings.some((w) => w.code === v.expectWarning);
      const named = report.scope !== undefined;
      if (!warned || !named) {
        rows.push({
          id: v.id,
          status: "error",
          detail: `companion warnings=${report.warnings.map((w) => w.code).join(",") || "none"}; scope=${named ? "named" : "absent"}`,
        });
        continue;
      }
      // Both were behaviour the posted -06 did not describe; -07, posted on
      // 2 September 2026, states them as MUST-T10-18 and MUST-T10-19, so this
      // is an ordinary pass.
      rows.push({
        id: v.id,
        status: "pass",
        detail: `companion warns ${v.expectWarning} and names scope ${report.scope!.accountId}/${report.scope!.railId}, as MUST-T10-18 and MUST-T10-19 require`,
      });
      continue;
    }

    if (v.kind === "refused-extract") {
      const rail = generateExtractKeys();
      const attacker = generateExtractKeys();
      const windowEndMs = NOW + 3_600_000;
      const honest = generateReceiptKeys();
      const receipt = signReceipt(
        {
          payer: "payer",
          payee: "payee",
          amount: "1",
          currency: "USD",
          policyHash: TEST_POLICY_HASH,
          manifestHash: null,
          noManifest: true,
          x402PaymentRef: "ref-ok",
          timestampMs: NOW,
          nonce: "n0".padEnd(16, "-"),
          prevReceiptHash: null,
          outcome: "settled",
        },
        honest.privateKeyPem,
        honest.publicKeyPem,
      );
      // The attacker signs their own extract and puts a different amount on the
      // honest receipt's ref. The pin refuses the document; the question this
      // vector asks is whether the refused body can still convict the receipt.
      const forged = signRailExtract(
        {
          accountId: "acct-1",
          railId: "rail-a",
          windowStartMs: NOW,
          windowEndMs,
          settlements: [{ ref: "ref-ok", amount: "2", currency: "USD", timestampMs: NOW }],
        },
        attacker.privateKeyPem,
        attacker.publicKeyPem,
      );
      const report = audit({
        receipts: [receipt],
        checkpoints: [],
        extract: forged,
        trust: {
          publicKeyPem: rail.publicKeyPem,
          accountId: "acct-1",
          railId: "rail-a",
          windowStartMs: NOW,
          windowEndMs,
        },
        issuerTrust: { publicKeyPem: honest.publicKeyPem },
      });
      const refused = report.findings.some((f) => f.code === "extract-key-mismatch");
      const charged = report.findings.some(
        (f) =>
          f.code === "settlement-mismatch" ||
          f.code === "settlement-without-receipt" ||
          f.code === "receipt-without-settlement",
      );
      const said = report.warnings.some((w) => w.code === v.expectWarning);
      if (!refused || charged || !said) {
        rows.push({
          id: v.id,
          status: "error",
          detail: `refused=${refused}; charged=${charged}; findings=${report.findings.map((f) => f.code).join(",") || "none"}; warnings=${report.warnings.map((w) => w.code).join(",") || "none"}`,
        });
        continue;
      }
      // Posted -06 reported the refusal and said nothing about the rows of the
      // document it refused; -07, posted on 2 September 2026, states the rule
      // as MUST-T10-20, so this is an ordinary pass.
      rows.push({
        id: v.id,
        status: "pass",
        detail: `companion reports extract-key-mismatch, reads no charge from the refused body, and warns ${v.expectWarning}, as MUST-T10-20 requires`,
      });
      continue;
    }

    if (v.kind === "boundary-deferred") {
      if (v.side !== "record" && v.side !== "row") {
        rows.push({ id: v.id, status: "error", detail: "boundary-deferred vector must set side" });
        continue;
      }
      if (
        v.windowStartMs === undefined ||
        v.windowEndMs === undefined ||
        v.clockSkewMs === undefined ||
        v.timestampMs === undefined
      ) {
        rows.push({ id: v.id, status: "error", detail: "boundary-deferred vector is missing a window or timestamp" });
        continue;
      }
      if (!v.expectWarning && typeof v.expectFinding !== "string" && !v.expectNoFinding) {
        rows.push({ id: v.id, status: "error", detail: "boundary-deferred vector states no expectation" });
        continue;
      }
      const rail = generateExtractKeys();
      const issuer = generateReceiptKeys();
      const pins = edgePins(rail, issuer, v.windowStartMs, v.windowEndMs);
      const extract = edgeExtract(
        rail,
        v.windowStartMs,
        v.windowEndMs,
        v.clockSkewMs,
        v.side === "row" ? [{ ref: EDGE_REF, timestampMs: v.timestampMs }] : [],
      );
      const receipts = v.side === "record" ? [edgeReceipt(issuer, v.timestampMs)] : [];
      const checkpoints =
        v.side === "record"
          ? [
              signCheckpoint(
                buildCheckpointClaims(1, receipts, v.windowStartMs, v.windowEndMs, null),
                issuer.privateKeyPem,
                issuer.publicKeyPem,
              ),
            ]
          : [];
      const report = audit({ receipts, checkpoints, extract, ...pins });
      const findingCodes: string[] = report.findings.map((f) => f.code);
      const warningCodes: string[] = report.warnings.map((w) => w.code);
      const problems: string[] = [];
      if (v.expectWarning && !warningCodes.includes(v.expectWarning)) {
        problems.push(`missing warning ${v.expectWarning}`);
      }
      if (typeof v.expectFinding === "string" && !findingCodes.includes(v.expectFinding)) {
        problems.push(`missing finding ${v.expectFinding}`);
      }
      if (v.expectNoFinding && findingCodes.includes(v.expectNoFinding)) {
        problems.push(`unexpected finding ${v.expectNoFinding}`);
      }
      if (problems.length > 0) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `${problems.join("; ")}; findings=${findingCodes.join(",") || "none"} warnings=${warningCodes.join(",") || "none"}`,
        });
      } else {
        const said = [
          v.expectWarning ? `warning ${v.expectWarning}` : "",
          typeof v.expectFinding === "string" ? `found ${v.expectFinding}` : "",
          v.expectNoFinding ? `no finding ${v.expectNoFinding}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        rows.push({ id: v.id, status: "pass", detail: said || "boundary-deferred matched" });
      }
      continue;
    }

    if (v.kind === "row-by-receipt") {
      if (
        v.windowStartMs === undefined ||
        v.windowEndMs === undefined ||
        v.clockSkewMs === undefined ||
        v.timestampMs === undefined ||
        v.receiptTimestampMs === undefined
      ) {
        rows.push({ id: v.id, status: "error", detail: "row-by-receipt vector is missing a window or timestamp" });
        continue;
      }
      if (!v.expectNoFinding) {
        rows.push({ id: v.id, status: "error", detail: "row-by-receipt vector states no expectation" });
        continue;
      }
      // The kind measures one thing: the row pairs with the receipt. Any other
      // code here would pass without measuring it.
      if (v.expectNoFinding !== "settlement-without-receipt") {
        rows.push({
          id: v.id,
          status: "error",
          detail: `row-by-receipt measures settlement-without-receipt, not ${v.expectNoFinding}`,
        });
        continue;
      }
      const rail = generateExtractKeys();
      const issuer = generateReceiptKeys();
      const pins = edgePins(rail, issuer, v.windowStartMs, v.windowEndMs);
      const extract = edgeExtract(rail, v.windowStartMs, v.windowEndMs, v.clockSkewMs, [
        { ref: EDGE_REF, timestampMs: v.timestampMs },
      ]);
      const report = audit({
        receipts: [edgeReceipt(issuer, v.receiptTimestampMs)],
        checkpoints: [],
        extract,
        ...pins,
      });
      const findingCodes: string[] = report.findings.map((f) => f.code);
      const warningCodes: string[] = report.warnings.map((w) => w.code);
      const problems: string[] = [];
      if (v.expectNoFinding && findingCodes.includes(v.expectNoFinding)) {
        problems.push(`unexpected finding ${v.expectNoFinding}`);
      }
      if (warningCodes.includes("boundary-deferred")) {
        problems.push("unexpected warning boundary-deferred");
      }
      if (report.counts.settlements.matched !== 1) {
        problems.push(`settlements matched=${report.counts.settlements.matched}`);
      }
      if (problems.length > 0) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `${problems.join("; ")}; findings=${findingCodes.join(",") || "none"} warnings=${warningCodes.join(",") || "none"}`,
        });
      } else {
        rows.push({
          id: v.id,
          status: "pass",
          detail: `no finding ${v.expectNoFinding ?? "settlement-without-receipt"}; no warning boundary-deferred`,
        });
      }
      continue;
    }

    if (v.kind === "facing-band") {
      if (v.adjacent !== "previous" && v.adjacent !== "next") {
        rows.push({ id: v.id, status: "error", detail: "facing-band vector must set adjacent" });
        continue;
      }
      if (
        v.windowStartMs === undefined ||
        v.windowEndMs === undefined ||
        v.clockSkewMs === undefined ||
        v.timestampMs === undefined
      ) {
        rows.push({ id: v.id, status: "error", detail: "facing-band vector is missing a window or timestamp" });
        continue;
      }
      if (!v.expectCarried && typeof v.expectFinding !== "string") {
        rows.push({ id: v.id, status: "error", detail: "facing-band vector states no expectation" });
        continue;
      }
      const rail = generateExtractKeys();
      const issuer = generateReceiptKeys();
      const pins = edgePins(rail, issuer, v.windowStartMs, v.windowEndMs);
      const receipt = edgeReceipt(issuer, v.timestampMs);
      const extract = edgeExtract(rail, v.windowStartMs, v.windowEndMs, v.clockSkewMs, []);
      const adjacentRows =
        typeof v.rowTimestampMs === "number"
          ? [{ ref: EDGE_REF, timestampMs: v.rowTimestampMs, amount: v.rowAmount ?? "1" }]
          : [];
      const previousExtract =
        v.adjacent === "previous"
          ? edgeExtract(rail, v.windowStartMs - EDGE_HOUR, v.windowStartMs, v.clockSkewMs, adjacentRows)
          : undefined;
      const nextExtract =
        v.adjacent === "next"
          ? edgeExtract(rail, v.windowEndMs, v.windowEndMs + EDGE_HOUR, v.clockSkewMs, adjacentRows)
          : undefined;
      const report = audit({
        receipts: [receipt],
        checkpoints: [
          signCheckpoint(
            buildCheckpointClaims(1, [receipt], v.windowStartMs, v.windowEndMs, null),
            issuer.privateKeyPem,
            issuer.publicKeyPem,
          ),
        ],
        extract,
        previousExtract,
        nextExtract,
        ...pins,
      });
      const findingCodes: string[] = report.findings.map((f) => f.code);
      const warningCodes: string[] = report.warnings.map((w) => w.code);
      const problems: string[] = [];
      if (v.expectCarried) {
        if (report.counts.receipts.carried !== 1) {
          problems.push(`carried=${report.counts.receipts.carried}`);
        }
        if (findingCodes.includes("receipt-without-settlement")) {
          problems.push("unexpected finding receipt-without-settlement");
        }
        if (warningCodes.includes("boundary-deferred")) {
          problems.push("unexpected warning boundary-deferred");
        }
      }
      if (typeof v.expectFinding === "string" && !findingCodes.includes(v.expectFinding)) {
        problems.push(`missing finding ${v.expectFinding}`);
      }
      if (problems.length > 0) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `${problems.join("; ")}; findings=${findingCodes.join(",") || "none"} warnings=${warningCodes.join(",") || "none"} carried=${report.counts.receipts.carried}`,
        });
      } else {
        const said = v.expectCarried
          ? "carried=1; no receipt-without-settlement; no boundary-deferred"
          : typeof v.expectFinding === "string"
            ? `found ${v.expectFinding}`
            : "facing-band matched";
        rows.push({ id: v.id, status: "pass", detail: said });
      }
      continue;
    }

    if (v.kind === "anchor") {
      if (
        v.anchor !== "absent" &&
        v.anchor !== "valid" &&
        v.anchor !== "foreign-key" &&
        v.anchor !== "epoch-off"
      ) {
        rows.push({ id: v.id, status: "error", detail: `anchor vector has anchor=${String(v.anchor)}` });
        continue;
      }
      if (!v.expectOk && typeof v.expectFinding !== "string") {
        rows.push({ id: v.id, status: "error", detail: "anchor vector states no expectation" });
        continue;
      }
      const issuer = generateReceiptKeys();
      const rail = generateExtractKeys();
      const nStart = NOW + 10 * EDGE_HOUR;
      const nEnd = nStart + EDGE_HOUR;
      const pStart = nStart - EDGE_HOUR;
      const r0 = signReceipt(
        {
          payer: "payer",
          payee: "payee-1",
          amount: "1",
          currency: "USD",
          policyHash: TEST_POLICY_HASH,
          manifestHash: null,
          noManifest: true,
          x402PaymentRef: "w-prev",
          timestampMs: pStart + 600_000,
          nonce: "a-prev".padEnd(16, "-"),
          prevReceiptHash: null,
          outcome: "settled",
        },
        issuer.privateKeyPem,
        issuer.publicKeyPem,
      );
      const cpPrev = signCheckpoint(
        buildCheckpointClaims(1, [r0], pStart, nStart, null),
        issuer.privateKeyPem,
        issuer.publicKeyPem,
      );
      const r1 = signReceipt(
        {
          payer: "payer",
          payee: "payee-1",
          amount: "1",
          currency: "USD",
          policyHash: TEST_POLICY_HASH,
          manifestHash: null,
          noManifest: true,
          x402PaymentRef: "w-n",
          timestampMs: nStart + 600_000,
          nonce: "a-n".padEnd(16, "-"),
          prevReceiptHash: receiptHash(r0),
          outcome: "settled",
        },
        issuer.privateKeyPem,
        issuer.publicKeyPem,
      );
      let cpN = signCheckpoint(
        buildCheckpointClaims(2, [r1], nStart, nEnd, checkpointHash(cpPrev)),
        issuer.privateKeyPem,
        issuer.publicKeyPem,
      );
      const extract = signRailExtract(
        {
          accountId: "acct",
          railId: "rail",
          windowStartMs: nStart,
          windowEndMs: nEnd,
          settlements: [{ ref: "w-n", amount: "1", currency: "USD", timestampMs: nStart + 600_000 }],
        },
        rail.privateKeyPem,
        rail.publicKeyPem,
      );
      const trust = {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: nStart,
        windowEndMs: nEnd,
      };
      let anchorCheckpoint: ReturnType<typeof signCheckpoint> | undefined;
      if (v.anchor === "valid") {
        anchorCheckpoint = cpPrev;
      } else if (v.anchor === "foreign-key") {
        const stranger = generateReceiptKeys();
        anchorCheckpoint = signCheckpoint(cpPrev.claims, stranger.privateKeyPem, stranger.publicKeyPem);
      } else if (v.anchor === "epoch-off") {
        anchorCheckpoint = signCheckpoint(
          { ...cpPrev.claims, epoch: 0 },
          issuer.privateKeyPem,
          issuer.publicKeyPem,
        );
        cpN = signCheckpoint(
          buildCheckpointClaims(2, [r1], nStart, nEnd, checkpointHash(anchorCheckpoint)),
          issuer.privateKeyPem,
          issuer.publicKeyPem,
        );
      }
      const report = audit({
        receipts: [r1],
        checkpoints: [cpN],
        extract,
        trust,
        issuerTrust: { publicKeyPem: issuer.publicKeyPem },
        ...(anchorCheckpoint ? { anchorCheckpoint } : {}),
      });
      const findingCodes: string[] = report.findings.map((f) => f.code);
      const problems: string[] = [];
      if (v.expectOk) {
        if (report.ok !== true || report.findings.length > 0) {
          problems.push(`ok=${report.ok}; findings=${findingCodes.join(",") || "none"}`);
        }
      }
      if (typeof v.expectFinding === "string") {
        const hit = report.findings.find(
          (f) => f.code === v.expectFinding && (v.expectId === undefined || f.id === v.expectId),
        );
        if (!hit) {
          problems.push(
            `missing finding ${v.expectFinding}${v.expectId ? ` id=${v.expectId}` : ""}`,
          );
        }
      }
      if (problems.length > 0) {
        rows.push({
          id: v.id,
          status: "split",
          detail: `${problems.join("; ")}; findings=${report.findings.map((f) => `${f.code}:${f.id}`).join(",") || "none"}`,
        });
      } else {
        const said = v.expectOk
          ? "ok; findings empty"
          : typeof v.expectFinding === "string"
            ? `found ${v.expectFinding}${v.expectId ? ` id=${v.expectId}` : ""}`
            : "anchor matched";
        rows.push({ id: v.id, status: "pass", detail: said });
      }
      continue;
    }

    if (v.kind === "json-text-refuse") {
      const refused = railExtractTextRefusal(v.text ?? "");
      const hit = refused === "json-duplicate-key";
      if (hit !== Boolean(v.expectRefuse)) {
        rows.push({
          id: v.id,
          status: "error",
          detail: `companion refuse=${refused ?? "null"}; expected json-duplicate-key=${Boolean(v.expectRefuse)}`,
        });
      } else {
        // Posted -06 states the rule (MUST-T4-20), so the companion and the
        // draft now say the same thing and this is an ordinary pass. It was
        // a counted split against posted -05, which was silent.
        rows.push({
          id: v.id,
          status: "pass",
          detail: `companion refuses ${refused}; posted -06 states the rule (MUST-T4-20)`,
        });
      }
      continue;
    }

    rows.push({ id: v.id, status: "error", detail: `unknown kind ${v.kind}` });
    } catch (err) {
      rows.push({ id: v.id, status: "error", detail: (err as Error).message });
    }
  }
  return rows;
}

function invokedAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === resolve(fileURLToPath(import.meta.url));
}

if (invokedAsCli()) {
  const rows = evaluateVectors(loadVectors());
  for (const r of rows) {
    console.log(`${r.status}\t${r.id}\t${r.detail}`);
  }
  const splits = rows.filter((r) => r.status === "split");
  const errors = rows.filter((r) => r.status === "error");
  console.log(
    `conformance: ${rows.length} vectors, ${splits.length} split, ${errors.length} error`,
  );
  if (splits.length > 0 || errors.length > 0) process.exitCode = 1;
}
