import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { audit } from "@cedulon/audit";
import { requestHashOf } from "@cedulon/core";
import {
  generateManifestKeys,
  manifestHash,
  signManifest,
} from "@cedulon/manifest";
import { generateReceiptKeys, receiptHash, signReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
};

export type Row = { id: string; status: "pass" | "split" | "error"; detail: string };

const NOW = 1_700_000_000_000;

export function loadVectors(): Vector[] {
  const spec = JSON.parse(readFileSync(join(root, "conformance", "vectors.json"), "utf8")) as {
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

export function evaluateVectors(vectors: Vector[]): Row[] {
  const rows: Row[] = [];
  for (const v of vectors) {
    try {
    if (v.kind === "sha256-of-hex") {
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
      const findingCodes = report.findings.map((f) => f.code);
      const warningCodes = report.warnings.map((w) => w.code);
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
