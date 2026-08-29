import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  AUDIT_MAX_CHECKPOINTS,
  AUDIT_MAX_INCLUSIONS,
  AUDIT_MAX_RECEIPTS,
  AUDIT_MAX_SETTLEMENTS,
} from "@cedulon/audit";
import {
  CBOR_MAX_BYTES,
  CBOR_MAX_DEPTH,
  CBOR_MAX_ELEMENTS,
  CBOR_MAX_STRING,
} from "@cedulon/cose";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIMITS = readFileSync(join(root, "docs", "LIMITS.md"), "utf8");

type Row = { bound: string; value: number | null; error: string; where: string };

function parseTable(md: string): Row[] {
  const rows: Row[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = /^\| ([^|]+) \| ([^|]+) \| `([^`]+)` \| `([^`]+)` \|$/.exec(line.trim());
    if (!m) continue;
    const bound = m[1]!.trim();
    const raw = m[2]!.trim();
    const value = raw === "—" ? null : Number(raw.replace(/[^\d]/g, ""));
    rows.push({ bound, value, error: m[3]!, where: m[4]! });
  }
  return rows;
}

const CODE: Record<string, { value: number; error: string; where: string }> = {
  "CBOR input": { value: CBOR_MAX_BYTES, error: "cbor-too-large", where: "decodeCbor" },
  "CBOR nest depth": { value: CBOR_MAX_DEPTH, error: "cbor-too-deep", where: "decodeCbor" },
  "CBOR array / map entries": { value: CBOR_MAX_ELEMENTS, error: "cbor-too-large", where: "decodeCbor" },
  "CBOR text / byte string": { value: CBOR_MAX_STRING, error: "cbor-too-large", where: "decodeCbor" },
  "Audit receipts": { value: AUDIT_MAX_RECEIPTS, error: "audit-too-large", where: "audit()" },
  "Audit settlements": { value: AUDIT_MAX_SETTLEMENTS, error: "audit-too-large", where: "audit()" },
  "Audit checkpoints": { value: AUDIT_MAX_CHECKPOINTS, error: "audit-too-large", where: "audit()" },
  "Audit inclusion receipts": { value: AUDIT_MAX_INCLUSIONS, error: "audit-too-large", where: "audit()" },
};

function assertDocMatchesCode(md: string): void {
  const rows = parseTable(md);
  for (const [bound, expect] of Object.entries(CODE)) {
    const row = rows.find((r) => r.bound === bound);
    assert.ok(row, `docs/LIMITS.md has no row for ${bound}`);
    assert.equal(row.value, expect.value, `${bound}: LIMITS.md says ${row.value}, code says ${expect.value}`);
    assert.equal(row.error, expect.error, `${bound}: error ${row.error} vs ${expect.error}`);
    assert.equal(row.where, expect.where, `${bound}: where ${row.where} vs ${expect.where}`);
  }
}

describe("LIMITS.md and the constants it describes", () => {
  it("RED: a drifted row fails before the living file is accepted", () => {
    const drifted = LIMITS.replace("65 536", "65 535");
    assert.notEqual(drifted, LIMITS, "fixture did not change the CBOR input row");
    assert.throws(
      () => assertDocMatchesCode(drifted),
      /CBOR input/,
    );
  });

  it("GREEN: every numbered bound in LIMITS.md is the constant in this tree", () => {
    assertDocMatchesCode(LIMITS);
  });
});
