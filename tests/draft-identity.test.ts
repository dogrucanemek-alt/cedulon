import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { draftRevision, identityHits } from "../scripts/draft-identity-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The draft under guard is the newest revision in the tree: a pinned
// filename went stale the moment -04 was written, and the five sentences
// this scan exists to catch sat in -04 while the guard read -03.
const LATEST = readdirSync(join(root, "spec"))
  .map((f) => /^draft-dogru-cedulon-(\d+)\.md$/.exec(f))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => m[1])
  .sort((a, b) => Number(a) - Number(b))
  .at(-1);
const DRAFT = join(root, "spec", `draft-dogru-cedulon-${LATEST}.md`);

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
