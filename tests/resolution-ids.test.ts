import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  companionDraftPaths,
  core00FamilyPaths,
  sideDraftPaths,
} from "../scripts/latest-draft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(root, p), "utf8");

const DEFINE = /\(`MUST-RS-(\d+)`\)/g;
const ANY = /MUST-RS-(\d+)/g;

function rsId(n: string | number): string {
  return `MUST-RS-${n}`;
}

function byRsNum(a: string, b: string): number {
  return Number(a.slice("MUST-RS-".length)) - Number(b.slice("MUST-RS-".length));
}

export function definedRsIds(text: string): string[] {
  return [...text.matchAll(DEFINE)].map((m) => rsId(m[1]!));
}

export function citedRsIds(text: string): string[] {
  return [...new Set([...text.matchAll(ANY)].map((m) => rsId(m[1]!)))].sort(byRsNum);
}

export function resolutionIdFailures(text: string): string[] {
  const defined = definedRsIds(text);
  const counts = new Map<string, number>();
  for (const id of defined) counts.set(id, (counts.get(id) ?? 0) + 1);
  const fails: string[] = [];
  for (const [id, n] of [...counts.entries()].sort(([a], [b]) => byRsNum(a, b))) {
    if (n !== 1) fails.push(`${id} is defined ${n} times`);
  }
  const nums = [...counts.keys()].map((id) => Number(id.slice("MUST-RS-".length)));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  for (let i = 1; i <= max; i += 1) {
    if (!counts.has(rsId(i))) fails.push(`${rsId(i)} is not defined`);
  }
  for (const id of citedRsIds(text)) {
    if (!counts.has(id)) fails.push(`${id} is cited but not defined`);
  }
  return fails;
}

function headingSection(md: string, heading: RegExp, next: RegExp): string {
  const m = heading.exec(md);
  assert.ok(m, `no section matching ${heading}`);
  const rest = md.slice(m.index + m[0].length);
  const end = next.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

export type RsCoverage = { implemented: string[]; notImplemented: string[] };

export function rsCoverage(text: string): RsCoverage {
  const implemented = new Set<string>();
  const notImplemented = new Set<string>();
  const addRange = (a: number, b: number, into: Set<string>): void => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let n = lo; n <= hi; n += 1) into.add(rsId(n));
  };
  for (const m of text.matchAll(/`MUST-RS-(\d+)` through `MUST-RS-(\d+)` are\s+implemented/g)) {
    addRange(Number(m[1]), Number(m[2]), implemented);
  }
  for (const m of text.matchAll(/implements `MUST-RS-(\d+)` through `MUST-RS-(\d+)`/g)) {
    addRange(Number(m[1]), Number(m[2]), implemented);
  }
  for (const m of text.matchAll(/`MUST-RS-(\d+)` and `MUST-RS-(\d+)` are\s+implemented/g)) {
    implemented.add(rsId(m[1]!));
    implemented.add(rsId(m[2]!));
  }
  for (const m of text.matchAll(/`MUST-RS-(\d+)` is(?: \*\*not\*\*| not)\s+implemented/g)) {
    notImplemented.add(rsId(m[1]!));
  }
  for (const m of text.matchAll(/`MUST-RS-(\d+)` is\s+implemented/g)) {
    const id = rsId(m[1]!);
    if (!notImplemented.has(id)) implemented.add(id);
  }
  for (const m of text.matchAll(/`MUST-RS-(\d+)` holds\b/g)) {
    const id = rsId(m[1]!);
    if (!notImplemented.has(id)) implemented.add(id);
  }
  for (const id of notImplemented) implemented.delete(id);
  return {
    implemented: [...implemented].sort(byRsNum),
    notImplemented: [...notImplemented].sort(byRsNum),
  };
}

export function coverageFailures(draft: string, status: string): string[] {
  const draftCov = rsCoverage(
    headingSection(draft, /^# Implementation Status\b/m, /^# /m),
  );
  const statusCov = rsCoverage(
    headingSection(status, /^## Resolution draft\b/m, /^## /m),
  );
  const fails: string[] = [];
  if (draftCov.implemented.join() !== statusCov.implemented.join()) {
    fails.push(
      `implemented disagree: draft [${draftCov.implemented.join(", ")}] STATUS [${statusCov.implemented.join(", ")}]`,
    );
  }
  if (draftCov.notImplemented.join() !== statusCov.notImplemented.join()) {
    fails.push(
      `not-implemented disagree: draft [${draftCov.notImplemented.join(", ")}] STATUS [${statusCov.notImplemented.join(", ")}]`,
    );
  }
  return fails;
}

const DRAFT = "spec/draft-dogru-cedulon-resolution-00.md";

describe("resolution identities", () => {
  it("is neither a numbered-series companion nor a -00 family member", () => {
    const companions = companionDraftPaths(root).map((p) => basename(p));
    assert.ok(
      !companions.some((f) => f.startsWith("draft-dogru-cedulon-resolution-")),
      `companionDraftPaths treated resolution as a companion: ${companions.join(", ")}`,
    );
    const family = core00FamilyPaths(root).map((p) => basename(p));
    assert.equal(family.length, 3, "expected core, checkpoint and threats under spec/");
    assert.ok(!family.some((f) => f.includes("resolution")));
    const sides = sideDraftPaths(root).map((p) => basename(p));
    assert.ok(
      sides.includes("draft-dogru-cedulon-resolution-00.md"),
      `sideDraftPaths missed the resolution draft: ${sides.join(", ")}`,
    );
  });

  it("RED: deleting MUST-RS-4 from the text is refused before the living file is accepted", () => {
    const living = read(DRAFT);
    const stripped = living.replaceAll("MUST-RS-4", "");
    assert.notEqual(stripped, living, "fixture did not remove MUST-RS-4");
    const fails = resolutionIdFailures(stripped);
    assert.ok(
      fails.some((f) => /MUST-RS-4 is not defined/.test(f)),
      JSON.stringify(fails),
    );
  });

  it("RED: a MUST-RS-99 citation with no definition is refused", () => {
    const living = read(DRAFT);
    const injected = `${living}\nA verifier that invents {{MUST-RS-99}} has left the set.\n`;
    const fails = resolutionIdFailures(injected);
    assert.ok(
      fails.some((f) => /MUST-RS-99 is cited but not defined/.test(f)),
      JSON.stringify(fails),
    );
  });

  it("GREEN: each MUST-RS identity is defined once and every citation is defined", () => {
    const fails = resolutionIdFailures(read(DRAFT));
    assert.deepEqual(fails, [], fails.join("\n"));
    assert.deepEqual(
      [...new Set(definedRsIds(read(DRAFT)))].sort(byRsNum),
      ["MUST-RS-1", "MUST-RS-2", "MUST-RS-3", "MUST-RS-4", "MUST-RS-5", "MUST-RS-6", "MUST-RS-7", "MUST-RS-8", "MUST-RS-9"],
    );
  });

  it("RED: STATUS that implements MUST-RS-9 while the draft does not is refused", () => {
    const draft = read(DRAFT);
    const status = read("docs/STATUS.md");
    const drifted = status.replace(
      "`MUST-RS-9` is not implemented",
      "`MUST-RS-9` is implemented",
    );
    assert.notEqual(drifted, status, "fixture did not flip MUST-RS-9");
    const fails = coverageFailures(draft, drifted);
    assert.ok(
      fails.some((f) => /not-implemented disagree/.test(f)),
      JSON.stringify(fails),
    );
  });

  it("GREEN: STATUS and the draft name the same implemented and unimplemented MUST-RS set", () => {
    const fails = coverageFailures(read(DRAFT), read("docs/STATUS.md"));
    assert.deepEqual(fails, [], fails.join("\n"));
    const coverage = rsCoverage(
      headingSection(read(DRAFT), /^# Implementation Status\b/m, /^# /m),
    );
    assert.deepEqual(coverage.notImplemented, ["MUST-RS-9"]);
    assert.deepEqual(
      coverage.implemented,
      ["MUST-RS-1", "MUST-RS-2", "MUST-RS-3", "MUST-RS-4", "MUST-RS-5", "MUST-RS-6", "MUST-RS-7", "MUST-RS-8"],
    );
  });
});
