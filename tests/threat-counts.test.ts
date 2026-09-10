import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COUNTING_GROUPS,
  SELECTIVE_GROUPS,
  citedInSection,
  definedByGroup,
  threatCountFailures,
  threatSections,
} from "../scripts/threat-counts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(root, p), "utf8");

const threats = read("spec/draft-dogru-cedulon-threats-00.md");
const defined = definedByGroup(
  read("spec/draft-dogru-cedulon-core-00.md"),
  read("spec/draft-dogru-cedulon-checkpoint-00.md"),
);

describe("threat sections that count, count everything", () => {
  it("the live document passes", () => {
    assert.deepEqual(threatCountFailures(threats, defined), []);
  });

  it("RED: dropping one identity from a counting section is caught", () => {
    // The defect as it happened: MUST-T6-7 was added to the core table and
    // the T6 narrative kept the list it had before.
    const broken = threats.replace(", MUST-T6-7.", ".");
    assert.notEqual(broken, threats, "the T6 list did not match; update this mutation");
    const failures = threatCountFailures(broken, defined);
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(failures[0]!, /^T6 counts its requirements but omits MUST-T6-7$/);
  });

  it("RED: a new threat section that is classified nowhere is caught", () => {
    const broken = threats.replace(
      "# T12: Settlement without a recorded receipt",
      "# T13: A threat nobody classified\n\nMUST-T13-1 is defined nowhere.\n\n# T12: Settlement without a recorded receipt",
    );
    const failures = threatCountFailures(broken, defined);
    assert.ok(
      failures.some((f) => /^T13 is on neither/.test(f)),
      failures.join(" | "),
    );
  });

  it("RED: completing a selective section demands a deliberate move", () => {
    const sections = threatSections(threats);
    const t8 = sections.find((s) => s.group === "T8")!;
    const family = [...(defined.get("T8") ?? [])].sort();
    assert.ok(family.length > citedInSection(t8).size, "T8 is no longer selective");
    const broken = threats.replace(t8.body, `${t8.body}\n${family.join(", ")}\n`);
    const failures = threatCountFailures(broken, defined);
    assert.ok(
      failures.some((f) => /^T8 is listed as selective .* move it to COUNTING_GROUPS$/.test(f)),
      failures.join(" | "),
    );
  });

  it("the selective sections stay selective, with their reason on record", () => {
    const sections = threatSections(threats);
    for (const [group, reason] of Object.entries(SELECTIVE_GROUPS)) {
      const section = sections.find((s) => s.group === group);
      assert.ok(section, `${group} has no section`);
      assert.ok(reason.length > 0, `${group} has no stated reason`);
      const family = defined.get(group) ?? new Set<string>();
      assert.ok(
        citedInSection(section!).size < family.size,
        `${group} names ${citedInSection(section!).size} of ${family.size}; it is no longer selective`,
      );
    }
  });

  it("every section of the document is classified exactly once", () => {
    const groups = threatSections(threats).map((s) => s.group);
    assert.ok(groups.length > 0, "no threat sections found; the heading shape changed");
    for (const group of groups) {
      const counting = COUNTING_GROUPS.includes(group);
      const selective = group in SELECTIVE_GROUPS;
      assert.notEqual(counting, selective, `${group} is classified ${counting ? "twice" : "not at all"}`);
    }
  });
});
