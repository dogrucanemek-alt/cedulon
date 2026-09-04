import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type AuditInput, type AuditReport } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { manifestHash, signManifest } from "@cedulon/manifest";
import { receiptHash, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { signRailExtract, type RailSettlement } from "@cedulon/x402-adapter";

// Setup copied from interop/abak-00/population-probe.mjs:215-260 (key
// generation, receipt / checkpoint / extract / PIN). The probe file is not
// edited; this test owns its own copies so the golden bytes stay in-tree.

const H = createHash("sha256").update("cedulon/abak-probe").digest("hex");
const NOW = 1_700_000_000_000;
const END = NOW + 3_600_000;
const MID = NOW + 1_800_000;
const CLOSING = END - 1;
const ACCEPTANCE = createHash("sha256").update("cedulon/abak-probe/acceptance").digest("hex");

// Test keys. They protect nothing; they exist so COSE hashes in the report
// (checkpoint-head details, if a case ever emits one) stay byte-stable.
const ik = {
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAOjn4be5GIhS3um354XdC99p+jnUagII+XeD+G7gmMu4=\n-----END PUBLIC KEY-----\n",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIEyphhXuw1hrR6dfJ6ojkQKWaqlXsXG7kNHdxV2cl1uF\n-----END PRIVATE KEY-----\n",
};
const rk = {
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAQ1uNbzy3tpq6rjm3tQexNl8dkv+DN41xcpEqPV7tdVA=\n-----END PUBLIC KEY-----\n",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEILpPp6Twy4pCYZSEscqA2TO6FTC/mqVIVuyp/yP1VBe+\n-----END PRIVATE KEY-----\n",
};
const wrongRail = {
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAnB3FvsGpJGFDRnHm5bb2aeJNEfx+HndQy45PUk8tWdw=\n-----END PUBLIC KEY-----\n",
};
const mk = {
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAHRGn93TwjAyxvKzvIWJBaKS10GfPsiuR/y9TFbdeH2w=\n-----END PUBLIC KEY-----\n",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIPJPoF0ADWzsJlPbljprTDwJ5ZxxaBCATdGSFaIu42f5\n-----END PRIVATE KEY-----\n",
};

type ReceiptOpt = {
  payee?: string;
  amount?: string;
  currency?: string;
  manifestHash?: string | null;
  ts?: number;
  outcome?: "settled" | "aborted";
  prevReceiptHash?: string | null;
  /** Keep the ref on an aborted receipt; the default drops it. */
  keepRef?: boolean;
};

const receipt = (ref: string, nonce: string, o: ReceiptOpt = {}): SignedReceipt =>
  signReceipt(
    {
      payer: "payer",
      payee: o.payee ?? "payee-1",
      amount: o.amount ?? "1",
      currency: o.currency ?? "USD",
      policyHash: H,
      manifestHash: o.manifestHash ?? null,
      noManifest: o.manifestHash === undefined,
      x402PaymentRef: o.outcome === "aborted" && !o.keepRef ? null : ref,
      timestampMs: o.ts ?? MID,
      nonce: nonce.padEnd(16, "-"),
      prevReceiptHash: o.prevReceiptHash ?? null,
      outcome: o.outcome ?? "settled",
    },
    ik.privateKeyPem,
    ik.publicKeyPem,
  );

const checkpoint = (receipts: SignedReceipt[]) =>
  signCheckpoint(buildCheckpointClaims(1, receipts, NOW, END, null), ik.privateKeyPem, ik.publicKeyPem);

const extract = (settlements: RailSettlement[], ws = NOW, we = END, extra: Record<string, unknown> = {}) =>
  signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: ws,
      windowEndMs: we,
      settlements,
      ...extra,
    } as Parameters<typeof signRailExtract>[0],
    rk.privateKeyPem,
    rk.publicKeyPem,
  );

const S = (ref: string, o: { amount?: string; currency?: string; ts?: number } = {}): RailSettlement => ({
  ref,
  amount: o.amount ?? "1",
  currency: o.currency ?? "USD",
  timestampMs: o.ts ?? MID,
});

const PIN = {
  publicKeyPem: rk.publicKeyPem,
  accountId: "acct",
  railId: "rail",
  windowStartMs: NOW,
  windowEndMs: END,
};

type RunExtra = Partial<AuditInput> & { omitExtract?: boolean };

const run = (receipts: SignedReceipt[], settlements: RailSettlement[], extra: RunExtra = {}) => {
  const { omitExtract, ...rest } = extra;
  return audit({
    receipts,
    checkpoints: receipts.length === 0 ? [] : [checkpoint(receipts)],
    issuerTrust: { publicKeyPem: ik.publicKeyPem },
    ...(omitExtract
      ? rest
      : { extract: extract(settlements), trust: PIN, ...rest }),
  });
};

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec).sort()) {
    out[k] = sortKeys(rec[k]);
  }
  return out;
}

export function canonicalReportJson(report: AuditReport): string {
  return `${JSON.stringify(sortKeys(JSON.parse(JSON.stringify(report))), null, 2)}\n`;
}

const termsManifest = signManifest(
  {
    description: "spend-golden-terms",
    amount: "1",
    currency: "USD",
    acceptanceCriteriaHash: ACCEPTANCE,
    cancelCondition: "none",
    expiresAtMs: END,
  },
  mk.privateKeyPem,
  mk.publicKeyPem,
);

function buildCases(): Record<string, AuditReport> {
  const bound = receipt("r-terms", "n-terms", {
    amount: "2",
    manifestHash: manifestHash(termsManifest),
  });
  return {
    matching: run([receipt("r1", "n1")], [S("r1")]),
    "issuer-only": run([receipt("r2", "n2")], []),
    "substitution-amount": run([receipt("r3", "n3")], [S("r3", { amount: "2" })]),
    "substitution-currency": run([receipt("r4", "n4")], [S("r4", { currency: "EUR" })]),
    "settlement-without-receipt": run([], [S("r5")]),
    "duplicate-ref": (() => {
      const first = receipt("r-dup", "n-dup-a");
      const second = receipt("r-dup", "n-dup-b", { prevReceiptHash: receiptHash(first) });
      return run([first, second], [S("r-dup"), S("r-dup", { ts: MID + 1 })]);
    })(),
    "malformed-amount": audit({
      receipts: [],
      checkpoints: [],
      settlements: [
        { ref: "dup", amount: "1.5", currency: "USD", timestampMs: MID },
        { ref: "dup", amount: "2", currency: "USD", timestampMs: MID + 1 },
      ],
    }),
    aborted: run([receipt("r-abort", "n-abort", { outcome: "aborted" })], []),
    // An aborted receipt may still carry the ref it tried. A row on that ref
    // is an uncovered settlement in today's words; the seam must not rename it.
    "aborted-with-ref": run(
      [receipt("r-abref", "n-abref", { outcome: "aborted", keepRef: true })],
      [S("r-abref")],
    ),
    "opening-boundary-deferred": run([], [S("r-open", { ts: NOW + 1 })]),
    "closing-boundary-carried": run([receipt("r-late", "n-late", { ts: CLOSING })], [], {
      nextExtract: extract([S("r-late", { ts: END })], END, END + 1_000),
    }),
    "extract-absent": run([receipt("r-abs", "n-abs")], [], { omitExtract: true }),
    "wrong-rail-key": run([receipt("r-pin", "n-pin")], [S("r-pin")], {
      trust: { ...PIN, publicKeyPem: wrongRail.publicKeyPem },
    }),
    // A rail may add members (`EXTRACT_SCOPE_FIELDS`: extra members are free).
    // One named `effects` must not re-route a spend audit onto another profile.
    "rail-extra-member-effects": run([receipt("r-extra", "n-extra")], [], {
      extract: extract([S("r-extra")], NOW, END, { effects: [], note: "free member" }),
    }),
    "manifest-terms-mismatch": audit({
      receipts: [bound],
      checkpoints: [checkpoint([bound])],
      extract: extract([S("r-terms", { amount: "2" })]),
      issuerTrust: { publicKeyPem: ik.publicKeyPem },
      trust: PIN,
      manifest: termsManifest,
      manifestTrust: { publicKeyPem: mk.publicKeyPem },
    }),
  };
}

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "spend-golden.json");

function goldenBytes(): string {
  const cases = buildCases();
  const body: Record<string, unknown> = {};
  for (const name of Object.keys(cases).sort()) {
    body[name] = sortKeys(JSON.parse(JSON.stringify(cases[name])));
  }
  return `${JSON.stringify(body, null, 2)}\n`;
}

if (process.env.WRITE_SPEND_GOLDEN === "1") {
  writeFileSync(FIXTURE, goldenBytes(), { encoding: "utf8" });
}

describe("spend golden: audit() bytes before and after the profile seam", () => {
  it("each named case matches tests/fixtures/spend-golden.json byte for byte", () => {
    const cases = buildCases();
    const expected = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
    for (const name of Object.keys(cases).sort()) {
      const actualJson = `${JSON.stringify(sortKeys(JSON.parse(JSON.stringify(cases[name]))), null, 2)}\n`;
      const expectedJson = `${JSON.stringify(expected[name], null, 2)}\n`;
      assert.equal(actualJson, expectedJson, name);
    }
    assert.equal(goldenBytes(), readFileSync(FIXTURE, "utf8"), "whole-file");
  });
});
