import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { latestDraftPath } from "../scripts/latest-draft.ts";
import {
  REQUIRED_SENTENCE,
  REQUIRED_URLS,
  VERAX_VERSION,
  extractDraftVerax,
  extractStatusVerax,
  forbiddenHits,
  implStatusVeraxFailures,
  urlsOf,
} from "../scripts/impl-status-verax.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const draft = readFileSync(latestDraftPath(root), "utf8");
const status = readFileSync(join(root, "docs/STATUS.md"), "utf8");

describe("Verax Implementation Status entries stay aligned", () => {
  it("the living draft and STATUS.md name the same URLs and versions", () => {
    assert.deepEqual(implStatusVeraxFailures(draft, status), []);
    const draftUrls = urlsOf(extractDraftVerax(draft)!);
    const statusUrls = urlsOf(extractStatusVerax(status)!);
    assert.deepEqual(draftUrls, [...REQUIRED_URLS].sort());
    assert.deepEqual(statusUrls, draftUrls);
    assert.match(extractDraftVerax(draft)!, new RegExp(VERAX_VERSION));
  });

  it("RED: a DOI that appears in the draft and not in STATUS is caught", () => {
    const drifted = status.replace(
      "https://doi.org/10.5281/zenodo.22811594",
      "https://doi.org/10.5281/zenodo.00000000",
    );
    const failures = implStatusVeraxFailures(draft, drifted);
    assert.ok(
      failures.some((f) => /URL/.test(f) || /omits/.test(f) || /22811594/.test(f)),
      failures.join(" | "),
    );
  });

  it("RED: first / only / independent in the Verax entry is refused", () => {
    assert.deepEqual(forbiddenHits(REQUIRED_SENTENCE), []);
    assert.deepEqual(forbiddenHits(`${REQUIRED_SENTENCE} An independent implementation.`), [
      "independent",
    ]);
    const claimed = draft.replace(
      /Same author as this document;\s*not an independent implementation\./,
      "Same author as this document. An independent implementation.",
    );
    const failures = implStatusVeraxFailures(claimed, status);
    assert.ok(
      failures.some((f) => /independent/.test(f)),
      failures.join(" | "),
    );
  });
});
