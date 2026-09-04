import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { companionDraftPaths, latestDraftPath } from "../scripts/latest-draft.ts";
import { draftMediaTypes, mediaTypeDiff, mediaTypeDiffAcross, statedCounts } from "../scripts/media-types-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every .ts under packages/*\/src, tests excluded: what the packages carry. */
function packageSources(): string[] {
  const out: string[] = [];
  const pkgs = join(root, "packages");
  for (const name of readdirSync(pkgs)) {
    const src = join(pkgs, name, "src");
    let entries: string[];
    try {
      entries = readdirSync(src, { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const rel of entries) {
      const p = join(src, rel);
      if (/\.ts$/.test(rel) && !/\.test\.ts$/.test(rel) && statSync(p).isFile()) {
        out.push(readFileSync(p, "utf8"));
      }
    }
  }
  assert.ok(out.length > 0, "no packages/*/src/**/*.ts found");
  return out;
}

const PROBE_DRAFT = [
  "# IANA Considerations {#iana}",
  "",
  "This document requests the registration of two media types.",
  "",
  "## application/cedulon-a+cbor",
  "",
  "Type name:",
  ": application",
  "",
  "Subtype name:",
  ": cedulon-a+cbor",
  "",
  "## application/cedulon-b+cbor",
  "",
  "Type name:",
  ": application",
  "",
  "Subtype name:",
  ": cedulon-b+cbor",
  "",
  "The two templates above are the whole request.",
  "",
  "# Security Considerations",
  "",
  "Subtype name:",
  ": cedulon-outside-the-section+cbor",
].join("\n");

describe("media types: the packages against the draft's IANA section", () => {
  it("RED then GREEN: a name the code carries and no template registers is reported, and the reverse", () => {
    const red = mediaTypeDiff(
      [
        'export const A = "application/cedulon-a+cbor";',
        'sign(payload, "application/cedulon-b+cbor"); const c = "application/cedulon-c+cbor";',
      ],
      PROBE_DRAFT,
    );
    assert.deepEqual(red.codeOnly, ["application/cedulon-c+cbor"]);
    assert.deepEqual(red.draftOnly, []);
    assert.equal(red.templateCount, 2, "a Subtype name past the section's end must not count");

    const missing = mediaTypeDiff(['"application/cedulon-a+cbor"'], PROBE_DRAFT);
    assert.deepEqual(missing.codeOnly, []);
    assert.deepEqual(missing.draftOnly, ["application/cedulon-b+cbor"]);

    const green = mediaTypeDiff(['"application/cedulon-a+cbor" "application/cedulon-b+cbor"'], PROBE_DRAFT);
    assert.deepEqual(green.codeOnly, []);
    assert.deepEqual(green.draftOnly, []);

    assert.deepEqual(statedCounts(PROBE_DRAFT), [2, 2]);
  });

  it("every media type the packages carry is registered by the core or a companion, and every template is carried", () => {
    // The core registers its six; the decision profile companion registers
    // its one. A name in the tree with a template in neither is the 0.9.0
    // defect (inclusion) again, and a template with no name behind it is a
    // document claiming code it does not have.
    const drafts = [latestDraftPath(root), ...companionDraftPaths(root)].map((p) => readFileSync(p, "utf8"));
    assert.ok(drafts.length >= 2, "expected the core and at least one companion under spec/");
    const diff = mediaTypeDiffAcross(packageSources(), drafts);
    assert.deepEqual(
      diff.codeOnly,
      [],
      `carried by packages/*/src, registered by no template: ${diff.codeOnly.join(", ")}`,
    );
    assert.deepEqual(
      diff.draftOnly,
      [],
      `registered by a draft, carried by no package: ${diff.draftOnly.join(", ")}`,
    );
  });

  it("the count each IANA prose states is the number of templates its section holds", () => {
    const paths = [latestDraftPath(root), ...companionDraftPaths(root)];
    let measured = 0;
    for (const p of paths) {
      const md = readFileSync(p, "utf8");
      const templates = draftMediaTypes(md).length;
      const stated = statedCounts(md);
      if (templates === 0 && stated.length === 0) continue; // "This document has no IANA actions."
      assert.ok(stated.length > 0, `${p}: the IANA prose states no count of its own templates`);
      for (const n of stated) {
        assert.equal(n, templates, `${p}: the prose says ${n}, the section holds ${templates} templates`);
      }
      measured += 1;
    }
    assert.ok(measured >= 2, "expected the core and the decision profile companion to state a count");
  });
});
