import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { draftRevision, identityHits } from "../scripts/draft-identity-guard.ts";
import { latestDraftPath, latestDraftRevision } from "../scripts/latest-draft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The draft under guard is the newest revision in the tree; the computation
// is shared so one new revision moves every guard that reads "the draft".
const LATEST = latestDraftRevision(join(root, "spec"));
const DRAFT = latestDraftPath(root);

describe("draft identity", () => {
  it("RED then GREEN: a -03 that still says This -02 is refused", () => {
    const probe = [
      "---",
      "docname: draft-dogru-cedulon-03",
      "---",
      "This -02 does not claim IETF consensus.",
      "later revisions (-03 or later), written with the same discipline as this -02.",
    ].join("\n");
    const red = identityHits(probe);
    assert.ok(
      red.some((h) => h.why.includes("calls itself -02")),
      `expected a hit on This -02, got ${JSON.stringify(red)}`,
    );
    assert.ok(
      red.some((h) => h.why.includes("later revision of itself")),
      `expected Evolution to treat -03 as future work, got ${JSON.stringify(red)}`,
    );

    const green = identityHits(
      ["---", "docname: draft-dogru-cedulon-03", "---", "This -03 does not claim IETF consensus.", "-02 stated a rule."].join(
        "\n",
      ),
    );
    assert.deepEqual(green, [], JSON.stringify(green));
  });

  it("the submitted draft's docname matches the voice of the document", () => {
    const md = readFileSync(DRAFT, "utf8");
    assert.equal(draftRevision(md), LATEST, "docname disagrees with the filename");
    const hits = identityHits(md);
    assert.deepEqual(
      hits,
      [],
      hits.map((h) => `${h.line}: ${h.why} :: ${h.text}`).join("\n"),
    );
  });
});
