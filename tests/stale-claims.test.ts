import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(root, p), "utf8");

/**
 * The terms split lives in two living sentences about the version
 * this tree carries. P4 changed the code and neither document; P5
 * pinned the sentences to "prepared, not published", which dies on
 * the publish day. The version is read from packages/*, not from a
 * heading adjective.
 */
function workspaceVersion(): string {
  const names = readdirSync(join(root, "packages"));
  const versions = new Set<string>();
  for (const name of names) {
    const pkgPath = join("packages", name, "package.json");
    let raw: string;
    try {
      raw = read(pkgPath);
    } catch {
      continue;
    }
    const version = (JSON.parse(raw) as { version?: string }).version;
    assert.ok(version, `${pkgPath} has no version`);
    versions.add(version);
  }
  assert.ok(versions.size > 0, "no package.json version found under packages/");
  assert.equal(
    versions.size,
    1,
    `packages/* disagree on version: ${[...versions].join(", ")}`,
  );
  return [...versions][0]!;
}

function upgradeSectionFor(upgrading: string, version: string): string {
  const esc = version.replace(/\./g, "\\.");
  const start = upgrading.search(new RegExp(`^## ${esc}\\b`, "m"));
  assert.ok(
    start >= 0,
    `docs/UPGRADING.md has no ## ${version} section (workspace version is ${version})`,
  );
  const from = upgrading.slice(start);
  const next = from.slice(1).search(/^## /m);
  return next < 0 ? from : from.slice(0, next + 1);
}

function statusVersionParagraph(status: string, version: string): string {
  const esc = version.replace(/\./g, "\\.");
  const m = status.match(new RegExp("(?:^|\\n\\n)`" + esc + "`[\\s\\S]*?(?:\\n\\n|$)"));
  assert.ok(
    m,
    `docs/STATUS.md has no paragraph that names \`${version}\` (workspace version is ${version})`,
  );
  return m[0];
}

function assertTermsSplitNamed(text: string, where: string): void {
  assert.match(
    text,
    /manifest-terms-mismatch/,
    `${where} does not name manifest-terms-mismatch`,
  );
  assert.match(
    text,
    /usable(?: issuer)? pin[\s\S]{0,280}finding/i,
    `${where} does not say a usable pin raises a finding`,
  );
  assert.match(
    text,
    /without a pin[\s\S]{0,280}warning/i,
    `${where} does not say that without a pin the charge is a warning`,
  );
}

function assertTermsSplitAligned(upgrading: string, status: string): void {
  const version = workspaceVersion();
  const section = upgradeSectionFor(upgrading, version);
  const paragraph = statusVersionParagraph(status, version);
  assertTermsSplitNamed(section, `docs/UPGRADING.md ${version}`);
  assertTermsSplitNamed(paragraph, `docs/STATUS.md ${version}`);
}

/** The publish-day shape: adjectives gone, version heading still there. */
function stripPreparedPhrases(upgrading: string, status: string): {
  upgrading: string;
  status: string;
} {
  return {
    upgrading: upgrading
      .replaceAll(" (prepared, not published)", "")
      .replace("it is prepared in this tree, not a published npm\nrelease. ", ""),
    status: status.replace(" is prepared in this tree, not a published npm release.", ""),
  };
}

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

const WIN32_GUARD = 'process.platform === "win32"';

/**
 * A numbered case exits before its last assert when the `it()` body has
 * `assert.` / `throws(` and a word-boundary `return` that sits before that
 * last assert, or when it names a node:test skip (`t.skip(...)` /
 * `it(..., { skip: ... })`). Platform guards are not part of the criterion:
 * case 42 returns on EPERM without asking `win32`, and the old scanner
 * called that a pass.
 *
 * Findings that are not skips live in EARLY_RETURN_ALLOWLIST with a reason.
 * Silent omission is how the previous criterion went stale.
 */
function lastAssertIndex(body: string): number {
  let last = -1;
  for (const re of [/\bassert\./g, /\bthrows\s*\(/g]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) last = Math.max(last, m.index);
  }
  return last;
}

function namesSkip(body: string): boolean {
  if (/\.skip\s*\(/.test(body)) return true;
  const headerEnd = body.search(/\)\s*=>/);
  const header = headerEnd >= 0 ? body.slice(0, headerEnd) : "";
  return /\bskip\s*:/.test(header);
}

function exitsBeforeLastAssert(body: string): boolean {
  if (namesSkip(body)) return true;
  const lastAssert = lastAssertIndex(body);
  if (lastAssert < 0) return false;
  const re = /\breturn\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index < lastAssert) return true;
  }
  return false;
}

function casesSkippedInSource(
  source: string,
  file = "",
): { id: string; file: string; line: number }[] {
  const found: { id: string; file: string; line: number }[] = [];
  for (const match of source.matchAll(/it\(\s*"(\d+)\s/g)) {
    const start = match.index + match[0].length;
    const next = source.indexOf("\n  it(", start);
    const body = source.slice(start, next > 0 ? next : source.length);
    if (!exitsBeforeLastAssert(body)) continue;
    found.push({
      id: match[1]!,
      file,
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return found.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Numbered cases whose early return is not a skip. Empty: every finding is counted. */
const EARLY_RETURN_ALLOWLIST: Record<string, string> = {};

/** Why each counted id is a skip, not a silent pass. */
const COUNTED_EARLY_EXITS: Record<string, string> = {
  "40": "POSIX file mode is not the access control on Windows",
  "42": "directory symlink EPERM/EACCES; TMPDIR through a link is unmeasurable here",
  "60": "POSIX directory mode is not the access control on Windows",
  "68": "POSIX directory mode is not the access control on Windows",
  "70": "file symlink EPERM on this host",
  "75": "POSIX directory mode is not the access control on Windows",
  "76": "directory symlink EPERM on this host",
  "83": "lock symlink EPERM on this host",
};

/** Cases that return or skip before their last assert, minus the allowlist. */
function casesSkippedOnWindows(): { id: string; file: string; line: number }[] {
  const found: { id: string; file: string; line: number }[] = [];
  for (const file of readdirSync(join(root, "tests")).filter(
    (n) => n.endsWith(".ts") && n !== "stale-claims.test.ts",
  )) {
    found.push(...casesSkippedInSource(read(join("tests", file)), `tests/${file}`));
  }
  return found
    .filter((c) => {
      if (EARLY_RETURN_ALLOWLIST[c.id]) return false;
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
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

  it("the set of cases that skip on Windows is the one two living documents describe", () => {
    // Written down rather than derived, because the point is to notice a change
    // and go read the prose. The posted draft is frozen: its Coverage paragraph
    // is corrected in -04, not by editing -03. The two living places:
    //   - docs/RUN_AS_VERIFIER.md, which warns an external verifier
    //   - docs/UPGRADING.md, under what is open on purpose
    const found = casesSkippedOnWindows();
    for (const c of found) {
      const reason = COUNTED_EARLY_EXITS[c.id] ?? EARLY_RETURN_ALLOWLIST[c.id] ?? "UNSTATED";
      console.log(`early-exit ${c.id} ${c.file}:${c.line} ${reason}`);
    }
    const expected = Object.keys(COUNTED_EARLY_EXITS).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    assert.deepEqual(
      found.map((c) => c.id),
      expected,
      "-03 is frozen; do not edit its Coverage paragraph. The set of cases that exit " +
        "before their last assert changed. Read docs/RUN_AS_VERIFIER.md and docs/UPGRADING.md, carry " +
        "the correction to -04, then update COUNTED_EARLY_EXITS. Allowlisted ids must keep a reason.",
    );
    for (const c of found) {
      assert.ok(
        COUNTED_EARLY_EXITS[c.id],
        `${c.id} at ${c.file}:${c.line} exits before its last assert and has no reason`,
      );
    }
  });

  it("the Windows-skip scanner sees a return that sits far past the platform guard", () => {
    // Case 40's return is 335 characters after the guard because a comment sits
    // between them. A 140-character window called that a pass. This fixture
    // puts the return even farther away so the same blind spot cannot come back.
    const padding = "      // the mode bits are not the access control here\n".repeat(12);
    const far = [
      `  it("99 RED then GREEN: return sits well beyond a 140-character window", () => {`,
      `    if (process.platform === "win32") {`,
      padding,
      `      return;`,
      `    }`,
      `    assert.ok(false);`,
      `  });`,
      ``,
    ].join("\n");
    const guard = far.indexOf(WIN32_GUARD);
    const ret = far.indexOf("return;");
    assert.ok(ret - guard > 140, `fixture is not far enough: ${ret - guard}`);
    assert.deepEqual(
      casesSkippedInSource(far).map((c) => c.id),
      ["99"],
    );

    const lookalike = [
      `  it("98 RED then GREEN: the word returns is not a skip", () => {`,
      `    if (process.platform === "win32") {`,
      `      const returns = 1;`,
      `      assert.equal(returns, 1);`,
      `    }`,
      `  });`,
      ``,
    ].join("\n");
    assert.deepEqual(casesSkippedInSource(lookalike).map((c) => c.id), []);

    const skipped = [
      `  it("97 RED then GREEN: node:test skip is a skip", (t) => {`,
      `    if (process.platform === "win32") {`,
      `      t.skip("POSIX modes are not the access control here");`,
      `    }`,
      `  });`,
      ``,
    ].join("\n");
    assert.deepEqual(
      casesSkippedInSource(skipped).map((c) => c.id),
      ["97"],
    );

    // Case 42's class: a host-capability return with no platform guard.
    // The win32-only scanner called this a pass while the suite did too.
    const unguarded = [
      `  it("96 RED then GREEN: EPERM return without a platform guard", () => {`,
      `    try {`,
      `      symlinkSync("x", "y", "dir");`,
      `    } catch (err) {`,
      `      const code = (err as NodeJS.ErrnoException).code;`,
      `      if (code === "EPERM" || code === "EACCES") {`,
      `        return;`,
      `      }`,
      `      throw err;`,
      `    }`,
      `    assert.ok(true);`,
      `  });`,
      ``,
    ].join("\n");
    assert.ok(!unguarded.includes(WIN32_GUARD), "fixture must not mention win32");
    assert.deepEqual(
      casesSkippedInSource(unguarded).map((c) => c.id),
      ["96"],
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

  it("RED: STATUS's version paragraph without the terms split fails before the living files are accepted", () => {
    const upgrading = read("docs/UPGRADING.md");
    const status = read("docs/STATUS.md");
    const drifted = status.replace(
      /It also narrows `manifest-terms-mismatch`:[\s\S]*?fail the audit\. /,
      "",
    );
    assert.notEqual(drifted, status, "fixture did not remove the terms split from STATUS");
    assert.throws(
      () => assertTermsSplitAligned(upgrading, drifted),
      /docs\/STATUS\.md \d+\.\d+\.\d+ does not name manifest-terms-mismatch/,
    );
  });

  it("RED: a missing version section names the workspace version, and does not skip", () => {
    const version = workspaceVersion();
    assert.throws(
      () => assertTermsSplitAligned("# Upgrading\n\n## 9.9.9\n\nno terms here\n", read("docs/STATUS.md")),
      new RegExp(`docs/UPGRADING.md has no ## ${version.replace(/\./g, "\\.")} section`),
    );
  });

  it("GREEN: the workspace-version UPGRADING section and STATUS paragraph name the same terms split", () => {
    assertTermsSplitAligned(read("docs/UPGRADING.md"), read("docs/STATUS.md"));
  });

  it("GREEN: the same check still holds after the prepared phrases are gone", () => {
    const livingUp = read("docs/UPGRADING.md");
    const livingSt = read("docs/STATUS.md");
    const published = stripPreparedPhrases(livingUp, livingSt);
    assert.notEqual(published.upgrading, livingUp, "fixture left the UPGRADING prepared phrase");
    assert.notEqual(published.status, livingSt, "fixture left the STATUS prepared phrase");
    assert.doesNotMatch(published.upgrading, /prepared, not published/);
    assert.doesNotMatch(published.status, /is prepared/);
    assertTermsSplitAligned(published.upgrading, published.status);
  });
});
