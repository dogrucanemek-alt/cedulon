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
    const workspace = (JSON.parse(read("packages/mcp-server/package.json")) as { version: string })
      .version;
    const status = read("docs/STATUS.md");

    const inDraft = read(DRAFT).match(/packages at version (\d+\.\d+\.\d+)/);
    assert.ok(inDraft, `${DRAFT} no longer names a published version`);
    const inStatus = status.match(/published on npm at `(\d+\.\d+\.\d+)`/);
    assert.ok(inStatus, "docs/STATUS.md no longer names the published version");
    // A posted draft is frozen; the packages keep moving. The invariant is not
    // that the two agree, it is that the draft never claims more than npm
    // carries. Overstating is the -00 defect that drew a DO NOT SUBMIT.
    // Understating is what a frozen document does between releases, and the
    // reader who checks finds more than was promised rather than less.
    const cmp = (a: string, b: string): number => {
      const x = a.split(".").map(Number);
      const y = b.split(".").map(Number);
      for (let i = 0; i < 3; i += 1) {
        if (x[i]! !== y[i]!) return x[i]! < y[i]! ? -1 : 1;
      }
      return 0;
    };
    assert.ok(
      cmp(inDraft[1]!, inStatus[1]!) <= 0,
      `the frozen draft claims ${inDraft[1]} published while STATUS says npm carries ${inStatus[1]}; a draft may lag the packages but must never claim ahead of them`,
    );
    const published = inStatus[1];

    // A prepared bump leaves the workspace ahead of npm. The sentences below
    // describe installed artifacts, not this tree. They stay on the published
    // number until that number moves. Painting them with the workspace version
    // is how -00 claimed a package it had not shipped.
    if (workspace !== published) {
      assert.match(
        status,
        new RegExp(`\`?${workspace.replaceAll(".", "\\.")}\`? is prepared in this tree`),
        `workspace is ${workspace} and npm is ${published}; STATUS must say the workspace version is prepared, not published`,
      );
      assert.match(
        status,
        /not a published npm release/,
        "a prepared bump without this phrase reads as already shipped",
      );
      assert.doesNotMatch(
        status,
        new RegExp(`published on npm at \`${workspace.replaceAll(".", "\\.")}\``),
        `STATUS must not claim ${workspace} is on npm`,
      );
    }

    const initialize = status.match(
      /clean install of\s+`@cedulon\/mcp-server@(\d+\.\d+\.\d+)` answers `initialize` reporting `(\d+\.\d+\.\d+)`/,
    );
    assert.ok(initialize, "docs/STATUS.md no longer describes a clean-install initialize");
    assert.equal(initialize[1], published, "STATUS clean-install pin is not the published version");
    assert.equal(initialize[2], published, "STATUS initialize reply is not the published version");

    const bundle = status.match(
      /The (\d+\.\d+\.\d+) bundle was built and unpacked: its manifest states\s+`(\d+\.\d+\.\d+)` and the server inside it installs `@cedulon\/mcp-server@\^(\d+\.\d+\.\d+)`/,
    );
    assert.ok(bundle, "docs/STATUS.md no longer describes the desktop bundle");
    assert.equal(bundle[1], published, "STATUS bundle heading is not the published version");
    assert.equal(bundle[2], published, "STATUS bundle manifest version is not the published version");
    assert.equal(bundle[3], published, "STATUS bundle install range is not the published version");

    const registry = status.match(/where `(\d+\.\d+\.\d+)` is the current version \(`isLatest`\)/);
    assert.ok(registry, "docs/STATUS.md no longer names the registry isLatest version");
    assert.equal(registry[1], published, "STATUS registry isLatest is not the published version");
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

  it("the README names the newest draft in the repository, not the one it was written against", () => {
    // Corrected by hand once per revision until an external runner found -02
    // still called current at -03. A sentence restated in two places drifts;
    // this compares the two instead of restating them.
    const revs = readdirSync(join(root, "spec"))
      .map((f) => /^draft-dogru-cedulon-(\d+)\.md$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1]);
    assert.ok(revs.length > 0, "no core drafts found in spec/");
    const newest = revs.sort().at(-1)!;
    assert.ok(
      read("README.md").includes(`draft-dogru-cedulon-${newest}`),
      `README does not name draft-dogru-cedulon-${newest}, the newest revision in spec/`,
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

    // The empty-set exception for a presented manifest: five writings, same
    // trap that left the issuer exception in two of five places.
    const writings = [
      ["heading", /## The manifest root \{#manifest-root\}/],
      ["requirement", /MUST-T4-15/],
      ["algorithm", /Where a Trade Manifest is presented/],
      ["finding-row", /unauthenticated-manifest \| conditional/],
      [
        "unconditional-list",
        /manifest root for whatever Trade Manifest\s+is presented/,
      ],
    ] as const;
    for (const [name, re] of writings) {
      assert.match(draft, re, `unauthenticated-manifest empty-set exception missing its ${name} writing`);
    }
    assert.match(
      draft,
      /An audit presented with no Trade Manifest is not made conditional by this requirement/,
      "the no-manifest exception must be said in the requirement, not only nearby",
    );
  });
});
