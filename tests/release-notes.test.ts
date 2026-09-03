import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { releaseNotesSection } from "../scripts/release-notes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const prepared = [
  "# Upgrading",
  "",
  "## 0.12.0 (prepared, not published)",
  "",
  "A. First paragraph, two lines",
  "long.",
  "",
  "B. Second paragraph.",
  "",
  "C. Third paragraph.",
  "",
  "What breaks: the fourth.",
  "",
  "## 0.11.0: the report counts what it classed",
  "",
  "Older.",
  "",
].join("\n");

describe("release notes come from the whole UPGRADING section", () => {
  it("takes every paragraph under the version heading up to the next heading", () => {
    const notes = releaseNotesSection(prepared, "0.12.0");
    assert.match(notes, /^A\. First paragraph/);
    assert.match(notes, /B\. Second paragraph\./);
    assert.match(notes, /C\. Third paragraph\./);
    assert.match(notes, /What breaks: the fourth\.$/);
    assert.doesNotMatch(notes, /Older/);
    assert.doesNotMatch(notes, /^## /m);
  });

  it("accepts the published heading form as well as the prepared one", () => {
    const published = prepared.replace("## 0.12.0 (prepared, not published)", "## 0.12.0: a title");
    assert.equal(releaseNotesSection(published, "0.12.0"), releaseNotesSection(prepared, "0.12.0"));
  });

  it("does not match a longer version that starts with the same digits", () => {
    const decoy = prepared.replace("## 0.11.0:", "## 0.12.01:");
    assert.doesNotMatch(releaseNotesSection(decoy, "0.12.0"), /Older/);
    assert.throws(() => releaseNotesSection(prepared, "0.1"), /no section/);
  });

  it("a heading that continues with letters or a dash is another section, even when it comes first", () => {
    // "## 0.12.0evil" and "## 0.12.0-rc1" placed above the real heading must not shadow it
    // (gate review of c1f8243). Only ":", " (", or end of line may follow the version.
    for (const shadow of ["## 0.12.0evil", "## 0.12.0-rc1", "## 0.12.0 evil"]) {
      const shadowed = prepared.replace("## 0.12.0 (prepared, not published)", `${shadow}\n\nShadow.\n\n## 0.12.0 (prepared, not published)`);
      const notes = releaseNotesSection(shadowed, "0.12.0");
      assert.doesNotMatch(notes, /Shadow/, shadow);
      assert.match(notes, /^A\. First paragraph/, shadow);
    }
  });

  it("throws when the version has no section", () => {
    assert.throws(() => releaseNotesSection(prepared, "9.9.9"), /no section/);
  });

  it("reads the real UPGRADING.md for the last published release", () => {
    const md = readFileSync(join(root, "docs", "UPGRADING.md"), "utf8");
    const notes = releaseNotesSection(md, "0.11.0");
    assert.match(notes, /adds a member and prints two lines/);
    assert.doesNotMatch(notes, /^## /m);
    assert.ok(notes.split("\n\n").length >= 2, "0.11.0 has more than one paragraph and all of them are taken");
  });
});
