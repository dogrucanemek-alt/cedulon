/**
 * A threat section that enumerates its requirements must enumerate all of
 * them.
 *
 * Found 2026-09-09: the T6 section read "Defined in {{CEDULON-CORE}}:
 * MUST-T6-1, -2, -4, -5, -6". The list was complete until MUST-T6-7 was
 * added to the core table, and adding it left the narrative silently short.
 * The identity gate could not see this: it asks whether every identity is
 * defined exactly once, not whether a document that counts them counts all
 * of them.
 *
 * Scope cannot be derived from the sentence shape, because the same shape
 * carries both a complete list (T12) and a deliberately partial one (T7).
 * So the scope is a named list, and every section in the document must
 * appear on exactly one of the two lists below - a new threat section
 * cannot slip in unclassified, which is the same omission that produced
 * the original defect.
 */

const MUST_ID = /MUST-T\d+-[\da-z]+/g;
const TABLE_ID = /^\|\s*((?:MUST|SHOULD|MAY)-T\d+-[\da-z]+)\s*\|/gm;
const SECTION = /^# (T\d+):/gm;

/** Sections whose narrative names every requirement of their group. */
export const COUNTING_GROUPS = ["T1", "T2", "T3", "T5", "T6", "T9", "T12"];

/**
 * Sections that cite a subset on purpose, with the reason. T4 and T10 point
 * at the core table by range instead of listing twenty-odd rows; T7 and T8
 * discuss the few requirements the narrative actually turns on.
 */
export const SELECTIVE_GROUPS: Record<string, string> = {
  T4: "cites the core table by range, not by list",
  T7: "names only the requirements the key-leakage narrative turns on",
  T8: "names only the requirement the gouging narrative turns on",
  T10: "cites the core table by range, not by list",
};

export type ThreatSection = { group: string; body: string };

export function threatSections(threats: string): ThreatSection[] {
  const heads = [...threats.matchAll(SECTION)];
  return heads.map((h, i) => ({
    group: h[1]!,
    body: threats.slice(h.index!, i + 1 < heads.length ? heads[i + 1]!.index! : threats.length),
  }));
}

/** Requirement identities the family defines in a table row, by group. */
export function definedByGroup(...docs: string[]): Map<string, Set<string>> {
  const byGroup = new Map<string, Set<string>>();
  for (const doc of docs) {
    for (const m of doc.matchAll(TABLE_ID)) {
      const id = m[1]!;
      if (!id.startsWith("MUST-")) continue;
      const group = /^MUST-(T\d+)-/.exec(id)![1]!;
      if (!byGroup.has(group)) byGroup.set(group, new Set());
      byGroup.get(group)!.add(id);
    }
  }
  return byGroup;
}

/** Identities of a section's own group that the section names. */
export function citedInSection(section: ThreatSection): Set<string> {
  const own = new RegExp(`^MUST-${section.group}-`);
  return new Set([...section.body.matchAll(MUST_ID)].map((m) => m[0]).filter((id) => own.test(id)));
}

export function threatCountFailures(threats: string, defined: Map<string, Set<string>>): string[] {
  const failures: string[] = [];
  const sections = threatSections(threats);
  const seen = new Set<string>();

  for (const section of sections) {
    const { group } = section;
    seen.add(group);
    const counts = COUNTING_GROUPS.includes(group);
    const selective = group in SELECTIVE_GROUPS;

    if (counts === selective) {
      failures.push(
        counts
          ? `${group} is on both the counting and the selective list`
          : `${group} is on neither the counting nor the selective list; say which it is`,
      );
      continue;
    }

    const family = defined.get(group) ?? new Set<string>();
    const cited = citedInSection(section);

    if (counts) {
      const missing = [...family].filter((id) => !cited.has(id)).sort();
      const unknown = [...cited].filter((id) => !family.has(id)).sort();
      if (missing.length) {
        failures.push(`${group} counts its requirements but omits ${missing.join(", ")}`);
      }
      if (unknown.length) {
        failures.push(`${group} names ${unknown.join(", ")}, which no table row defines`);
      }
      continue;
    }

    // Selective sections are the false-positive anchor: they must stay a
    // strict subset, so that completing one is a deliberate move onto the
    // counting list rather than a silent change of meaning.
    const unknown = [...cited].filter((id) => !family.has(id)).sort();
    if (unknown.length) {
      failures.push(`${group} names ${unknown.join(", ")}, which no table row defines`);
    }
    if (family.size > 0 && cited.size >= family.size) {
      failures.push(
        `${group} is listed as selective (${SELECTIVE_GROUPS[group]}) but now names all ${family.size}; move it to COUNTING_GROUPS`,
      );
    }
  }

  for (const group of [...COUNTING_GROUPS, ...Object.keys(SELECTIVE_GROUPS)]) {
    if (!seen.has(group)) failures.push(`${group} is classified but has no section in the document`);
  }

  return failures;
}
