import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(root, p), "utf8");

const DRAFT = "spec/draft-dogru-cedulon-03.md";

/**
 * Three sentences in this repository describe something outside the file they
 * live in: the published version a reader is pointed at, what a green suite on
 * one platform does not cover, and whether the specification still lacks
 * something the code has. Each went stale at least once, and the platform one
 * went stale three times, because the thing described kept moving while the
 * sentence stayed put. Each check below reads the thing rather than another
 * sentence about it.
 *
 * What this file cannot do: decide whether an English sentence is true. It
 * pins the facts a sentence depends on, so a change to the fact fails here and
 * the prose gets looked at. A wrong sentence about an unchanged fact still
 * needs a reader.
 */

/** Cases that return early on Windows instead of asserting. */
function casesSkippedOnWindows(): string[] {
  const found: string[] = [];
  for (const file of readdirSync(join(root, "tests")).filter((n) => n.endsWith(".ts"))) {
    const source = read(join("tests", file));
    for (const match of source.matchAll(/it\(\s*"(\d+)\s/g)) {
      const start = match.index + match[0].length;
      const next = source.indexOf("\n  it(", start);
      const body = source.slice(start, next > 0 ? next : source.length);
      const guard = body.indexOf('process.platform === "win32"');
      if (guard === -1) continue;
      if (body.slice(guard, guard + 140).includes("return")) found.push(match[1]);
    }
  }
  return found.sort();
}

describe("claims that describe something outside their own file", () => {
  it("the draft and the status page point at the version the packages carry", () => {
    const version = (JSON.parse(read("packages/mcp-server/package.json")) as { version: string })
      .version;

    const inDraft = read(DRAFT).match(/packages at version (\d+\.\d+\.\d+)/);
    assert.ok(inDraft, `${DRAFT} no longer names a published version`);
    assert.equal(
      inDraft[1],
      version,
      "the draft points a reader at a package version the repository does not build",
    );

    const inStatus = read("docs/STATUS.md").match(/published on npm at `(\d+\.\d+\.\d+)`/);
    assert.ok(inStatus, "docs/STATUS.md no longer names the published version");
    assert.equal(inStatus[1], version, "docs/STATUS.md names a different version than the draft");
  });

  it("the set of cases that skip on Windows is the one three documents describe", () => {
    // Written down rather than derived, because the point is to notice a change
    // and go read the prose. The three places that describe this set:
    //   - the Coverage paragraph in the draft, which says which protections a
    //     green suite on Windows leaves unexercised
    //   - docs/RUN_AS_VERIFIER.md, which warns an external verifier
    //   - docs/UPGRADING.md, under what is open on purpose
    const expected = ["60", "68", "70", "75", "76", "80", "81", "83"];
    assert.deepEqual(
      casesSkippedOnWindows(),
      expected,
      "The set of cases that skip on Windows changed. Three documents describe it: the " +
        `Coverage paragraph in ${DRAFT}, the note near the top of docs/RUN_AS_VERIFIER.md, ` +
        "and the open-on-purpose list in docs/UPGRADING.md. Read all three, then update " +
        "this list.",
    );
  });

  it("no status page cites a requirement the draft does not define, or calls a closed gap open", () => {
    const draft = read(DRAFT);
    const defined = new Set(
      [...draft.matchAll(/^\|\s*((?:MUST|SHOULD|MAY)-T\d+-[\da-z]+)\s*\|/gm)].map((m) => m[1]),
    );
    assert.ok(defined.size > 0, "no requirements parsed out of the draft");

    for (const doc of ["docs/STATUS.md", "docs/UPGRADING.md", "README.md"]) {
      for (const match of read(doc).matchAll(/(?:MUST|SHOULD|MAY)-T\d+-[\da-z]+/g)) {
        assert.ok(
          defined.has(match[0]),
          `${doc} cites ${match[0]}, which ${DRAFT} does not define`,
        );
      }
    }

    // STATUS said MUST-T10-8 had no counterpart for the other signed objects
    // and that it belonged in a later revision. The revision arrived, the
    // section is in this draft, and the sentence stayed behind. The claim and
    // the section cannot both be present.
    const status = read("docs/STATUS.md");
    if (/has no counterpart/.test(status)) {
      assert.ok(
        !draft.includes("# Trust roots"),
        "docs/STATUS.md says a requirement has no counterpart, but the draft carries the " +
          "Trust roots section that provides it",
      );
    }
  });
});
