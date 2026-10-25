import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { COUNTED_SPLITS } from "../conformance/counted-splits.ts";
import {
  evaluateVectors,
  loadVectors,
  type Row,
  type Vector,
} from "../conformance/run.ts";

/**
 * A split is a recorded disagreement with the posted draft, not a
 * defect to paper over. The list is named and reasoned, the same
 * way COUNTED_EARLY_EXITS is. An unlisted split, a listed split
 * that vanished, an unknown kind, and a thrown vector each fail
 * this file. They used to be a note, a split, or a memory.
 */
function assertConformance(rows: Row[]): void {
  const errors = rows.filter((r) => r.status === "error");
  assert.equal(
    errors.length,
    0,
    `conformance error (not a split): ${errors.map((e) => `${e.id}: ${e.detail}`).join("; ") || "none"}`,
  );
  const splitIds = new Set(rows.filter((r) => r.status === "split").map((r) => r.id));
  for (const row of rows) {
    if (row.status !== "split") continue;
    assert.ok(
      COUNTED_SPLITS[row.id],
      `unregistered split ${row.id}: ${row.detail}`,
    );
  }
  for (const [id, reason] of Object.entries(COUNTED_SPLITS)) {
    assert.ok(reason.length > 0, `${id} is counted without a reason`);
    assert.ok(
      splitIds.has(id),
      `counted split ${id} is gone; the list is stale. ${reason}`,
    );
  }
}

function living(): Vector[] {
  return loadVectors().map((v) => ({ ...v }));
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Ids of vectors whose `draft` is not found, whitespace aside, in the document `doc` names. */
function quoteMisses(vectors: Vector[]): string[] {
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();
  const docs = new Map<string, string>();
  const misses: string[] = [];
  for (const v of vectors) {
    if (!v.doc) continue;
    if (!docs.has(v.doc)) docs.set(v.doc, flat(readFileSync(join(root, "spec", `${v.doc}.md`), "utf8")));
    if (!docs.get(v.doc)!.includes(flat(v.draft))) misses.push(v.id);
  }
  return misses;
}

describe("conformance vectors run in the suite", () => {
  it("RED: an unregistered split fails before the living vectors are accepted", () => {
    const drifted = living().map((v) =>
      v.id === "V-T8-9-honest-amount" ? { ...v, expectFinding: "not-a-code" } : v,
    );
    const rows = evaluateVectors(drifted);
    const hit = rows.find((r) => r.id === "V-T8-9-honest-amount");
    assert.equal(hit?.status, "split", `expected a split, got ${hit?.status}: ${hit?.detail}`);
    assert.throws(
      () => assertConformance(rows),
      /unregistered split V-T8-9-honest-amount/,
    );
  });

  it("RED: unknown kind is an error, not a silent note", () => {
    const drifted = living().map((v) =>
      v.id === "V-T4-17-unbound" ? { ...v, kind: "not-a-kind" } : v,
    );
    const rows = evaluateVectors(drifted);
    const hit = rows.find((r) => r.id === "V-T4-17-unbound");
    assert.equal(hit?.status, "error", `expected error, got ${hit?.status}: ${hit?.detail}`);
    assert.match(hit!.detail, /unknown kind not-a-kind/);
    assert.throws(() => assertConformance(rows), /conformance error \(not a split\): V-T4-17-unbound/);
  });

  it("RED: a thrown vector is an error, not a split", () => {
    const drifted = living().map((v) =>
      v.id === "V-T8-7-manifest-hash" ? { ...v, hex: undefined } : v,
    );
    const rows = evaluateVectors(drifted);
    const hit = rows.find((r) => r.id === "V-T8-7-manifest-hash");
    assert.equal(hit?.status, "error", `expected error, got ${hit?.status}: ${hit?.detail}`);
    assert.notEqual(hit?.status, "split");
    assert.throws(() => assertConformance(rows), /conformance error \(not a split\): V-T8-7-manifest-hash/);
  });

  it("RED: a request-hash vector that claims the draft named a digest, without carrying one, is an error", () => {
    // The living vector now says the draft names the digest and carries the
    // value, because -04 is posted and states it. The condition worth proving
    // is the half-done one: the claim without the value. The fixture drifts
    // toward that rather than toward the state the tree already has.
    const drifted = living().map((v) =>
      v.id === "V-T3-4-request-hash"
        ? { ...v, draftNamesDigest: true, expectRequestHash: undefined }
        : v,
    );
    const rows = evaluateVectors(drifted);
    const hit = rows.find((r) => r.id === "V-T3-4-request-hash");
    assert.equal(hit?.status, "error", `expected error, got ${hit?.status}: ${hit?.detail}`);
    assert.match(hit!.detail, /draftNamesDigest is true/);
    assert.throws(() => assertConformance(rows), /conformance error \(not a split\): V-T3-4-request-hash/);
  });

  it("a vector that names its document quotes that document word for word", () => {
    // The expected result is taken from the sentence beside it, so the
    // sentence has to be the document's and not a paraphrase that can drift.
    const misquoted = quoteMisses(living());
    assert.deepEqual(misquoted, []);
    const drifted = living().map((v) =>
      v.id === "V-C5-T10-17-zero-allowance" ? { ...v, draft: "An allowance of zero defers everything." } : v,
    );
    assert.deepEqual(quoteMisses(drifted), ["V-C5-T10-17-zero-allowance"]);
  });

  it("core-05 vectors cover the four edge quadrants, the facing band and the anchor", () => {
    const core05 = living().filter((v) => v.doc === "draft-dogru-cedulon-core-05");
    const kinds = new Set(core05.map((v) => v.kind));
    for (const k of ["boundary-deferred", "row-by-receipt", "facing-band", "anchor"]) {
      assert.ok(kinds.has(k), `no core-05 vector of kind ${k}`);
    }
    const quadrants = new Set(
      core05
        .filter((v) => v.kind === "boundary-deferred" && v.expectWarning === "boundary-deferred")
        .map((v) => `${v.side}:${v.timestampMs! < (v.windowStartMs! + v.windowEndMs!) / 2 ? "opening" : "closing"}`),
    );
    assert.deepEqual([...quadrants].sort(), ["record:closing", "record:opening", "row:closing", "row:opening"]);
  });

  it("GREEN: living vectors match the counted split list", () => {
    const rows = evaluateVectors(loadVectors());
    assert.ok(rows.length > 0, "no vectors ran");
    assertConformance(rows);
  });
});
