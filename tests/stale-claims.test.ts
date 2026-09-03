import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { COUNTED_SPLITS } from "../conformance/counted-splits.ts";
import { loadVectors } from "../conformance/run.ts";
import { latestDraftRevision, latestPostedRevision } from "../scripts/latest-draft.ts";

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

function assertRequestHashSplitNamed(text: string, where: string): void {
  assert.match(text, /SHA-256/, `${where} does not say requestHash is SHA-256`);
  assert.match(
    text,
    /six-field\s+canonical/i,
    `${where} does not name the six-field canonical document`,
  );
  assert.match(
    text,
    /digest/,
    `${where} does not say the posted draft does not name the digest`,
  );
}

function assertRequestHashSplitAligned(upgrading: string, status: string): void {
  const version = workspaceVersion();
  const section = upgradeSectionFor(upgrading, version);
  const paragraph = statusVersionParagraph(status, version);
  assertRequestHashSplitNamed(section, `docs/UPGRADING.md ${version}`);
  assertRequestHashSplitNamed(paragraph, `docs/STATUS.md ${version}`);
}

/**
 * Drift the living text the assertion actually reads: the section and paragraph
 * for the workspace version. These probes used to name 0.6.0's sentences, which
 * measured the right thing only while 0.6.0 was the workspace version - the
 * moment the tree moved to 0.7.0 they drifted text nothing checked and reported
 * a guard that still worked. A probe has to follow the version its assertion
 * follows.
 */
function driftUpgradingSection(upgrading: string, phrase: string): string {
  const section = upgradeSectionFor(upgrading, workspaceVersion());
  const drifted = section.replaceAll(phrase, "");
  assert.notEqual(drifted, section, `fixture did not remove ${phrase} from the UPGRADING section`);
  return upgrading.replace(section, drifted);
}

function driftStatusParagraph(status: string, phrase: string): string {
  const paragraph = statusVersionParagraph(status, workspaceVersion());
  const drifted = paragraph.replaceAll(phrase, "");
  assert.notEqual(drifted, paragraph, `fixture did not remove ${phrase} from the STATUS paragraph`);
  return status.replace(paragraph, drifted);
}

/**
 * The records list on the front page names the deposit made for a posted
 * revision, and that line must name the newest posted one. Kept as a function
 * of the page text so the red fixtures below can hand it a drifted page.
 */
function assertDepositLineNamesPosted(page: string, newest: string): void {
  const named = [
    ...page.matchAll(
      /the deposit for the posted -(\d+) revision is <a href="https:\/\/doi\.org\/10\.5281\/zenodo\.\d+">/g,
    ),
  ].map((m) => m[1]);
  assert.equal(
    named.length,
    1,
    "site/index.html no longer names the deposit of a posted revision; the page and this check describe the same line",
  );
  assert.equal(
    named[0],
    newest,
    `site/index.html names the deposit for -${named[0]}; the newest posted revision in spec/ is -${newest}`,
  );
}

function mustIdsIn(text: string): Set<string> {
  return new Set([...text.matchAll(/MUST-T\d+-\d+/g)].map((m) => m[0]));
}

function countedMustIds(counted: Record<string, string>): Set<string> {
  const vectors = loadVectors();
  const out = new Set<string>();
  for (const id of Object.keys(counted)) {
    const v = vectors.find((x) => x.id === id);
    assert.ok(v, `COUNTED_SPLITS ${id} has no vector`);
    for (const m of mustIdsIn(v.must)) out.add(m);
    for (const m of mustIdsIn(counted[id]!)) out.add(m);
  }
  return out;
}

/**
 * The UPGRADING blocks that document a living split against a posted draft:
 * they name a revision and say the difference closes. This used to match
 * only "-03" and the exact phrase "difference will be closed", so the -05
 * split written as "closes when -06 states the rule" never entered the set
 * and the alignment below passed with nothing on either side. A guard that
 * matches one revision's wording is a guard for exactly one revision.
 */
function upgradingSplitBlocks(section: string): string[] {
  return section
    .split(/\n\n/)
    .filter((block) => /-0\d/.test(block) && /(difference will be closed|closes when|will be closed)/i.test(block));
}

function upgradingSplitMustIds(section: string): Set<string> {
  const out = new Set<string>();
  for (const block of upgradingSplitBlocks(section)) {
    for (const m of mustIdsIn(block)) out.add(m);
  }
  return out;
}

function assertDraftSplitsAligned(
  upgrading: string,
  counted: Record<string, string>,
): void {
  const version = workspaceVersion();
  const section = upgradeSectionFor(upgrading, version);
  const blocks = upgradingSplitBlocks(section);
  const documented = upgradingSplitMustIds(section);
  const countedIds = countedMustIds(counted);
  for (const must of documented) {
    assert.ok(
      countedIds.has(must),
      `UPGRADING ${version} names ${must} as a -03 split but COUNTED_SPLITS has no vector for it`,
    );
  }
  for (const must of countedIds) {
    assert.ok(
      documented.has(must),
      `COUNTED_SPLITS names ${must} but UPGRADING ${version} does not name it as a -03 split`,
    );
  }
  // A split whose vector carries no MUST identity yet (a rule the posted
  // draft does not state) is bound by its vector id instead: the UPGRADING
  // block must name the id, and every named id must be a counted split.
  for (const id of Object.keys(counted)) {
    assert.ok(
      blocks.some((b) => b.includes(id)),
      `COUNTED_SPLITS names ${id} but no UPGRADING ${version} split block names that vector id`,
    );
  }
  for (const block of blocks) {
    for (const id of block.match(/V-T\d+-[A-Za-z0-9-]+/g) ?? []) {
      assert.ok(
        Object.hasOwn(counted, id),
        `UPGRADING ${version} names ${id} as a living split but COUNTED_SPLITS does not carry it`,
      );
    }
  }
}

/**
 * The pre-publish shape: version heading carries the adjective, and both
 * documents say the version is prepared rather than shipped.
 *
 * This used to strip those phrases instead of adding them, because the
 * living files carried them and the publish day was the case worth
 * simulating. 0.6.0 shipped, the living files became that shape, and the
 * strip turned into a no-op that asserted nothing. The direction that
 * still needs a fixture is the other one.
 */
function addPreparedPhrases(upgrading: string, status: string): {
  upgrading: string;
  status: string;
} {
  return {
    upgrading: upgrading
      .replace(/^(## \d+\.\d+\.\d+)(:)/m, "$1 (prepared, not published)$2")
      .replace("This one breaks. ", "This one breaks, and it is prepared in this tree, not a published npm\nrelease. "),
    // Anchored on the claim rather than on one spelling of the sentence that
    // carries it. The old fixture matched " is published on npm." exactly and
    // stopped finding anything the day that sentence grew a subordinate
    // clause, which made a fixture failure look like a guard failure.
    status: status
      .replace(/ is published on npm\b/, " is prepared in this tree, not a published npm release")
      .replace(/ are published on npm at `\d+\.\d+\.\d+`/, " are not published yet"),
  };
}

// The living draft, not a frozen one: this check describes what the current
// revision says, and -03 stopped being that the day -04 was written.
const DRAFT = `spec/draft-dogru-cedulon-${latestDraftRevision(join(root, "spec"))}.md`;

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
  "42": "directory symlink EPERM/EACCES; TMPDIR through a link is unmeasurable here",
  "70": "file symlink EPERM on this host",
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
    // Offline on purpose: this number is what STATUS named, and the
    // rest of this file checks the documents against each other. They
    // can be consistent and still wrong about npm — that is how 0.6.0
    // shipped while STATUS still said 0.5.0. Whether the number is
    // what npm actually serves is tests/published-as.test.ts under
    // test:post-release. The two checks stay apart so pre-release
    // never grows a network dependency.

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

    // The MCP Registry is a second distribution channel and it moves on its
    // own: the workflow now carries a registry step, unproven until the next
    // tag runs it, so the two numbers can still differ and the
    // difference is a fact about what a user receives, not a drift to forbid.
    // Requiring them equal would push the document toward the tidier sentence
    // rather than the true one. What must not happen is the lag going unsaid.
    const registry = status.match(/where `(\d+\.\d+\.\d+)` is the current version \(`isLatest`\)/);
    assert.ok(registry, "docs/STATUS.md no longer names the registry isLatest version");
    if (registry[1] !== published) {
      // Every space here is `\s+`, because the sentence is prose in a wrapped
      // file and a line break falls wherever the paragraph happens to reach the
      // margin. Matching literal spaces measured the layout: the notice was
      // present and correct at 0.8.0 and failed twice, once because "the MCP
      // Registry" straddled a line and once because "a release" did. What must
      // stay strict is which sentence has to be there, not where it wraps.
      const spaced = (phrase: string): RegExp =>
        new RegExp(phrase.trim().split(/\s+/).map((w) => w.replaceAll(".", "\\.")).join("\\s+"));
      assert.match(
        status,
        spaced(`npm serves \`${published}\`, the MCP Registry still serves \`${registry[1]!}\``),
        `STATUS says the registry is at ${registry[1]} and npm at ${published} but never says the listing is behind; a reader installing from the registry has to be told which version they get`,
      );
      // The lag has to be named, and named correctly. This used to demand the
      // literal "a release behind npm", which was true only while the gap was
      // one release: at npm 0.9.0 against a 0.7.0 listing the guard was asking
      // for a sentence that had become false. Every release in this project
      // bumps the minor, so the gap is the minor difference, and the count the
      // prose claims is measured against it rather than assumed.
      assert.match(
        status,
        spaced("behind npm"),
        "the lag between npm and the MCP Registry is named nowhere in STATUS",
      );
      const gap = Number(published.split(".")[1]) - Number(registry[1]!.split(".")[1]);
      const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
      const claimed = status.match(/(\w+)\s+releases?\s+behind\s+npm/);
      if (claimed) {
        const n = words[claimed[1]!.toLowerCase()] ?? Number(claimed[1]);
        assert.equal(
          n,
          gap,
          `STATUS says ${claimed[1]} release(s) behind npm; npm is ${published} and the listing is ${registry[1]}, a gap of ${gap}`,
        );
      }
    }
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

  it("the site spec page names the newest draft, and only that one", () => {
    // The README got this guard a revision ago; the site page did not, and
    // sat on -02 through two postings with every suite green. Same defect,
    // same repair: compare the page to the tree instead of trusting a hand
    // that edits both.
    const newest = latestDraftRevision(join(root, "spec"));
    const page = read("site/spec.html");
    const named = [...page.matchAll(/draft-dogru-cedulon-(\d+)/g)].map((m) => m[1]);
    assert.ok(
      named.length > 0,
      "site/spec.html no longer names the draft at all; the page and this check describe the same document",
    );
    for (const rev of named) {
      assert.equal(
        rev,
        newest,
        `site/spec.html names draft-dogru-cedulon-${rev}; the newest revision in spec/ is -${newest}`,
      );
    }
  });

  it("the site names the Zenodo deposit of the newest posted draft, not an older one", () => {
    // The records list on the front page names the deposit made for a posted
    // revision. Each revision gets its own deposit, so the line naming the
    // previous one stays true and goes stale in the same moment. Compare the
    // revision the line names to the tree instead of trusting the hand that
    // edits both - to the newest posted revision, the one with archive text
    // in spec/, not the newest source: a revision opened for the next posting
    // has no deposit yet, and this line is not about it. Keyed on the source,
    // this check went red the moment -08 was opened, with the line still true.
    assertDepositLineNamesPosted(read("site/index.html"), latestPostedRevision(join(root, "spec")));
  });

  it("RED: a deposit line left on the previous posted revision fails, and a page with no deposit line fails", () => {
    // The two ways this line goes wrong, shown to fire before the green run
    // above is trusted: the line is true of the revision before the newest
    // posted one, or the line is gone. Both are built from the live page so
    // the fixture drifts with it rather than pinning a revision number.
    const newest = latestPostedRevision(join(root, "spec"));
    const page = read("site/index.html");
    const previous = String(Number(newest) - 1).padStart(newest.length, "0");
    const stale = page.replace(`the deposit for the posted -${newest} revision`, `the deposit for the posted -${previous} revision`);
    assert.notEqual(stale, page, "fixture did not move the deposit line to the previous revision");
    assert.throws(
      () => assertDepositLineNamesPosted(stale, newest),
      new RegExp(`names the deposit for -${previous}; the newest posted revision in spec/ is -${newest}`),
    );
    const gone = page.replace(/the deposit for the posted -\d+ revision is <a href="https:\/\/doi\.org\/10\.5281\/zenodo\.\d+">[^<]*<\/a>/, "");
    assert.notEqual(gone, page, "fixture did not remove the deposit line");
    assert.throws(() => assertDepositLineNamesPosted(gone, newest), /no longer names the deposit of a posted revision/);
  });

  it("RED then GREEN: the newest posted revision is the newest archive text, and an opened revision with no text is not posted", () => {
    // What "posted" means to the tree: the archive text is carried beside the
    // source. This is a discipline, not a datatracker query, and the fixture
    // shows both edges of it on a synthetic spec/ rather than the live one: a
    // .md with no .txt is opened and not posted; a .txt dropped in before
    // posting would read as posted, which is why the render stays out of the
    // tree until the posting day.
    const dir = mkdtempSync(join(tmpdir(), "cedulon-spec-"));
    try {
      assert.throws(() => latestPostedRevision(dir), /no draft-dogru-cedulon-NN\.txt/);
      writeFileSync(join(dir, "draft-dogru-cedulon-07.md"), "");
      writeFileSync(join(dir, "draft-dogru-cedulon-07.txt"), "");
      writeFileSync(join(dir, "draft-dogru-cedulon-08.md"), "");
      assert.equal(latestDraftRevision(dir), "08");
      assert.equal(latestPostedRevision(dir), "07");
      writeFileSync(join(dir, "draft-dogru-cedulon-08.txt"), "");
      assert.equal(latestPostedRevision(dir), "08");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it("RED: UPGRADING without the requestHash split fails before the living files are accepted", () => {
    const upgrading = read("docs/UPGRADING.md");
    const status = read("docs/STATUS.md");
    const drifted = driftUpgradingSection(upgrading, "SHA-256");
    assert.throws(
      () => assertRequestHashSplitAligned(drifted, status),
      /docs\/UPGRADING\.md \d+\.\d+\.\d+ does not say requestHash is SHA-256/,
    );
  });

  it("RED: STATUS's version paragraph without the requestHash split fails before the living files are accepted", () => {
    const upgrading = read("docs/UPGRADING.md");
    const status = read("docs/STATUS.md");
    const drifted = driftStatusParagraph(status, "SHA-256");
    assert.throws(
      () => assertRequestHashSplitAligned(upgrading, drifted),
      /docs\/STATUS\.md \d+\.\d+\.\d+ does not say requestHash is SHA-256/,
    );
  });

  it("GREEN: the workspace-version UPGRADING section and STATUS paragraph name the requestHash split", () => {
    assertRequestHashSplitAligned(read("docs/UPGRADING.md"), read("docs/STATUS.md"));
  });

  // Both directions used to be proved by drifting a live divergence. -04 is
  // posted and both closed, so there is no live one to borrow - and a guard
  // that can only be proved while it has something to catch is proved for
  // exactly the period nobody needs it. The fixtures are synthetic now, and
  // stay valid whether or not a divergence exists.
  const syntheticSection = (body: string): string =>
    `# Upgrading\n\n## ${workspaceVersion()}: fixture\n\n${body}\n`;

  it("RED: an UPGRADING -03 split with no COUNTED_SPLITS entry fails", () => {
    const upgrading = syntheticSection(
      "The published draft `-03` (MUST-T99-1) says one thing and this tree does\n" +
        "another. The difference will be closed in `-05`, with the reason.",
    );
    assert.throws(
      () => assertDraftSplitsAligned(upgrading, {}),
      /UPGRADING \d+\.\d+\.\d+ names MUST-T99-1 as a -03 split but COUNTED_SPLITS has no vector for it/,
    );
  });

  it("RED: a COUNTED_SPLITS entry no UPGRADING -03 split names fails", () => {
    // A real vector id, because the check resolves the id to a vector before
    // it reads the MUST identities out of it.
    const counted = {
      "V-T8-9-depart-unpinned":
        "MUST-T8-9: fixture entry with no matching paragraph in UPGRADING.",
    };
    assert.throws(
      () => assertDraftSplitsAligned(syntheticSection("No divergence is named here."), counted),
      /COUNTED_SPLITS names MUST-T8-9 but UPGRADING \d+\.\d+\.\d+ does not name it as a -03 split/,
    );
  });

  it("GREEN: an empty split list and an UPGRADING that names none agree", () => {
    assertDraftSplitsAligned(syntheticSection("No divergence is named here."), {});
  });

  it("RED: a counted split with no MUST identity is bound by its vector id, and an UPGRADING that omits the id fails", () => {
    // Measured before this fixture: the living -05 split carries no MUST
    // identity, the alignment compared two empty sets, and an UPGRADING that
    // never mentioned the split passed. The id is the binding now.
    const counted = {
      "V-T4-19-json-duplicate-key":
        "posted -05 says nothing about duplicate member names; companion refuses; closes when -06 states the rule",
    };
    assert.throws(
      () =>
        assertDraftSplitsAligned(
          syntheticSection("A living split stands against posted `-05` and closes when `-06` states the rule."),
          counted,
        ),
      /COUNTED_SPLITS names V-T4-19-json-duplicate-key but no UPGRADING \d+\.\d+\.\d+ split block names that vector id/,
    );
    assert.throws(
      () =>
        assertDraftSplitsAligned(
          syntheticSection(
            "A living split stands against posted `-05`: `V-T4-19-json-duplicate-key` closes when `-06` states the rule, and so does `V-T9-9-not-counted`.",
          ),
          counted,
        ),
      /UPGRADING \d+\.\d+\.\d+ names V-T9-9-not-counted as a living split but COUNTED_SPLITS does not carry it/,
    );
    assertDraftSplitsAligned(
      syntheticSection(
        "A living split stands against posted `-05`: `V-T4-19-json-duplicate-key` closes when `-06` states the rule.",
      ),
      counted,
    );
  });

  it("GREEN: no split is living, because -07 states all three rules", () => {
    // The state the tree is in now, asserted rather than assumed. The JSON
    // duplicate-member departure stood against posted -05 and closed when
    // -06 was posted with MUST-T4-20. Two splits then stood against posted
    // -06: the companion warned `unstated-audit-scope` and named the path it
    // covered, and it stopped reading a settlement charge out of an extract
    // its pin had refused. Both closed on 2 September 2026 when -07 was
    // posted, with MUST-T10-18 and MUST-T10-19 for the first and MUST-T10-20
    // for the second.
    assert.deepEqual(Object.keys(COUNTED_SPLITS), []);
  });

  it("GREEN: UPGRADING -03 splits and COUNTED_SPLITS name the same MUST identities", () => {
    assertDraftSplitsAligned(read("docs/UPGRADING.md"), COUNTED_SPLITS);
  });

  it("RED: STATUS's version paragraph without the terms split fails before the living files are accepted", () => {
    const upgrading = read("docs/UPGRADING.md");
    const status = read("docs/STATUS.md");
    const drifted = driftStatusParagraph(status, "manifest-terms-mismatch");
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

  it("GREEN: the same check still holds while a version is prepared and not yet published", () => {
    const livingUp = read("docs/UPGRADING.md");
    const livingSt = read("docs/STATUS.md");
    const prepared = addPreparedPhrases(livingUp, livingSt);
    assert.notEqual(prepared.upgrading, livingUp, "fixture did not add the UPGRADING prepared phrase");
    assert.notEqual(prepared.status, livingSt, "fixture did not add the STATUS prepared phrase");
    assert.match(prepared.upgrading, /prepared, not published/);
    assert.match(prepared.status, /is prepared in this tree/);
    assertTermsSplitAligned(prepared.upgrading, prepared.status);
  });
});
