import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  crossRefFailures,
  publicationCrossRefFailures,
  publicationDraftPaths,
  unresolvedRefs,
} from "../scripts/cross-ref-guard.ts";
import { livingCoreDraftPath } from "../scripts/latest-draft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wordingRed = (...parts: string[]) =>
  readFileSync(join(root, "tests", "fixtures", "wording-red", ...parts), "utf8");

describe("publication cross-references resolve", () => {
  it("every {{x}} in the living publication drafts resolves to an anchor or bibliography key", () => {
    assert.deepEqual(publicationCrossRefFailures(root), []);
  });

  it("publicationDraftPaths includes the living resolution side draft", () => {
    const names = publicationDraftPaths(root).map((p) => p.replace(/\\/g, "/").split("/").pop());
    assert.ok(
      names.includes("draft-dogru-cedulon-resolution-00.md"),
      `expected resolution among ${JSON.stringify(names)}`,
    );
  });

  it("RED: a core draft that cites {{refusal-names}} is caught", () => {
    const oldCore = wordingRed("cross-ref-refusal-names.md");
    const hits = crossRefFailures(oldCore, "draft-dogru-cedulon-core-05.md");
    assert.ok(
      hits.some((h) => h.ref === "refusal-names"),
      `expected refusal-names among ${JSON.stringify(hits)}`,
    );
  });

  it("RED: a resolution draft that cites {{MUST-RS-1}} is caught once side drafts are in scope", () => {
    const living = readFileSync(join(root, "spec", "draft-dogru-cedulon-resolution-00.md"), "utf8");
    // Reconstruct the braced cite against the living file when it already
    // carries the backtick form.
    const probe = living.includes("{{MUST-RS-1}}")
      ? living
      : living.replace("`MUST-RS-1`", "{{MUST-RS-1}}");
    assert.ok(probe.includes("{{MUST-RS-1}}"), "fixture must hold the braced cite");
    const hits = crossRefFailures(probe, "draft-dogru-cedulon-resolution-00.md");
    assert.ok(
      hits.some((h) => h.ref === "MUST-RS-1"),
      `expected MUST-RS-1 among ${JSON.stringify(hits)}`,
    );
  });

  it("RED then GREEN: a dangling {{no-such-anchor}} is caught and a real anchor is not", () => {
    const probe = [
      "---",
      "docname: draft-probe-00",
      "normative:",
      "  RFC2119:",
      "---",
      "",
      "# Body {#body}",
      "",
      "See {{body}} and {{RFC2119}} and {{no-such-anchor}}.",
    ].join("\n");
    assert.deepEqual(unresolvedRefs(probe), ["no-such-anchor"]);
    assert.deepEqual(
      unresolvedRefs(probe.replace("{{no-such-anchor}}", "{{body}}")),
      [],
    );
  });

  it("RED then GREEN: a spaced {{ body }} is malformed and a tight {{body}} is not", () => {
    const base = [
      "---",
      "docname: draft-probe-00",
      "---",
      "",
      "# Body {#body}",
      "",
    ].join("\n");
    assert.deepEqual(unresolvedRefs(`${base}See {{ body }}.`), ["body"]);
    assert.deepEqual(unresolvedRefs(`${base}See {{body}}.`), []);
  });

  it("the living core draft no longer cites {{refusal-names}}", () => {
    const core = readFileSync(livingCoreDraftPath(root), "utf8");
    assert.equal(core.includes("{{refusal-names}}"), false);
    assert.equal(core.includes("{{finding-code-table}}"), true);
  });
});
