import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { core00FamilyPaths } from "../scripts/latest-draft.ts";
import {
  CEDULON_VERSION,
  REQUIRED_SENTENCE,
  REQUIRED_URLS,
  VERAX_VERSION,
  extractDraftVerax,
  extractStatusVerax,
  forbiddenHits,
  implStatusVeraxFailures,
  livingCoreDraftPath,
  postedRevisionFailures,
  urlsOf,
} from "../scripts/impl-status-verax.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const draft = readFileSync(livingCoreDraftPath(root), "utf8");
const status = readFileSync(join(root, "docs/STATUS.md"), "utf8");

describe("Verax Implementation Status entries stay aligned", () => {
  it("the living core document is the newest core file in the family", () => {
    const core = livingCoreDraftPath(root).replace(/\\/g, "/");
    assert.match(core, /draft-dogru-cedulon-core-06\.md$/);
    const familyCore = core00FamilyPaths(root)
      .map((p) => p.replace(/\\/g, "/"))
      .find((p) => /draft-dogru-cedulon-core-\d+\.md$/.test(p));
    assert.equal(familyCore, core);
  });

  it("the living core document and STATUS.md name the same URLs and versions", () => {
    assert.deepEqual(implStatusVeraxFailures(draft, status), []);
    const draftUrls = urlsOf(extractDraftVerax(draft)!);
    const statusUrls = urlsOf(extractStatusVerax(status)!);
    assert.deepEqual(draftUrls, [...REQUIRED_URLS].sort());
    assert.deepEqual(statusUrls, draftUrls);
    assert.match(extractDraftVerax(draft)!, new RegExp(VERAX_VERSION));
  });

  it("RED: a DOI that appears in the draft and not in STATUS is caught", () => {
    const drifted = status.replace(
      "https://doi.org/10.5281/zenodo.22811593",
      "https://doi.org/10.5281/zenodo.00000000",
    );
    const failures = implStatusVeraxFailures(draft, drifted);
    assert.ok(
      failures.some((f) => /URL/.test(f) || /omits/.test(f) || /22811593/.test(f)),
      failures.join(" | "),
    );
  });

  it("RED: a lowered Verax version in the core document is caught", () => {
    const lowered = draft.replaceAll(VERAX_VERSION, "0.2.1");
    const failures = implStatusVeraxFailures(lowered, status);
    assert.ok(
      failures.some((f) => f.includes(VERAX_VERSION)),
      failures.join(" | "),
    );
  });

  it("RED: one stale Verax version beside a current one is caught", () => {
    const stale = draft.replace(`on npm at ${VERAX_VERSION}`, "on npm at 0.2.1");
    assert.notEqual(stale, draft);
    const failures = implStatusVeraxFailures(stale, status);
    assert.ok(
      failures.some((f) => f.includes("on npm at 0.2.1")),
      failures.join(" | "),
    );
  });

  it("RED: a @cedulon/* package dropped from one entry is caught", () => {
    const dropped = status.replaceAll("`@cedulon/x402-adapter`", "the adapter");
    assert.notEqual(dropped, status);
    const failures = implStatusVeraxFailures(draft, dropped);
    assert.ok(
      failures.some((f) => f.includes("@cedulon/x402-adapter")),
      failures.join(" | "),
    );
  });

  it("RED: @cedulon/* at another version beside the current one is caught", () => {
    const stale = status.replace(
      `all at \`@cedulon/*\` ${CEDULON_VERSION},`,
      `all at \`@cedulon/*\` ${CEDULON_VERSION}, earlier \`@cedulon/*\` 0.12.0,`,
    );
    assert.notEqual(stale, status);
    const failures = implStatusVeraxFailures(draft, stale);
    assert.ok(
      failures.some((f) => f.includes("0.12.0")),
      failures.join(" | "),
    );
  });

  it("RED: a core document with no Verax entry is refused", () => {
    const failures = implStatusVeraxFailures(
      "# Implementation Status\n\nThis section names the companion implementation.\n",
      status,
    );
    assert.ok(
      failures.some((f) => /no Verax implementation entry/.test(f)),
      failures.join(" | "),
    );
  });

  it("both entries say the packages are not claimed to implement a posted revision", () => {
    assert.deepEqual(postedRevisionFailures("the draft", extractDraftVerax(draft)!), []);
    assert.deepEqual(postedRevisionFailures("the STATUS", extractStatusVerax(status)!), []);
  });

  it("RED: the draft entry saying the packages implement the posted draft-09 is caught", () => {
    const claimed = draft.replace(
      /Those packages are\s+not claimed to implement a posted revision:[\s\S]*?and no posted revision describes the result\./,
      "Those published packages implement the posted draft-dogru-cedulon-09 profile and, from 0.13.0, the posted draft-dogru-cedulon-decision-profile-03.",
    );
    assert.notEqual(claimed, draft);
    const failures = implStatusVeraxFailures(claimed, status);
    assert.ok(failures.some((f) => f.startsWith("the draft Verax entry claims a posted revision is implemented")), failures.join(" | "));
    assert.ok(failures.some((f) => f.includes('"not claimed to implement a posted revision"')), failures.join(" | "));
    assert.ok(failures.some((f) => f.includes('"no posted revision describes the result"')), failures.join(" | "));
  });

  it("RED: the STATUS entry saying the packages implement the posted draft-09 is caught", () => {
    const claimed = status.replace(
      /Those packages are not claimed to implement a posted revision:[\s\S]*?no posted revision describes the result\./,
      "Those published packages implement the posted draft-dogru-cedulon-09\nprofile and, from 0.13.0, the posted\ndraft-dogru-cedulon-decision-profile-03.",
    );
    assert.notEqual(claimed, status);
    const failures = implStatusVeraxFailures(draft, claimed);
    assert.ok(failures.some((f) => f.startsWith("the STATUS Verax entry claims a posted revision is implemented")), failures.join(" | "));
  });

  it("RED: dropping either half of the disclaimer is caught", () => {
    const noResult = status.replace(/,\s+and\s+no posted revision describes the result\./, ".");
    assert.notEqual(noResult, status);
    assert.deepEqual(postedRevisionFailures("the STATUS", extractStatusVerax(noResult)!), [
      'the STATUS Verax entry does not say "no posted revision describes the result"',
    ]);
    const noClaim = draft.replace(/not claimed to\s+implement a posted revision/, "described below");
    assert.notEqual(noClaim, draft);
    assert.deepEqual(postedRevisionFailures("the draft", extractDraftVerax(noClaim)!), [
      'the draft Verax entry does not say "not claimed to implement a posted revision"',
    ]);
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
