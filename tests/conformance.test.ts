import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

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

  it("GREEN: living vectors match the counted split list", () => {
    const rows = evaluateVectors(loadVectors());
    assert.ok(rows.length > 0, "no vectors ran");
    assertConformance(rows);
  });
});
