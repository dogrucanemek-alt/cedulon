/**
 * The `-00` family identity gate. A MUST identity is defined by a
 * requirements-table row. Citations in prose are free; a row in two
 * documents, or a row in none, is the defect the mechanical split left
 * for Kademe B to close.
 *
 * MUST-T11-1 and MUST-T11-12 stay in the core table (label set and
 * reconciliation conditionality). Every other T11 row belongs in the
 * checkpoint companion.
 *
 * The mechanical split is finished. The `-00` series may now carry a
 * MUST the numbered inventory does not, but only by name, on this
 * list. A new identity that is not listed is still a defect. A name
 * that leaves the family is still a defect: `missing` stays hard.
 */

export const TABLE_ID = /^\|\s*((?:MUST|SHOULD|MAY)-T\d+-[\da-z]+)\s*\|/gm;
export const MUST_ID = /MUST-T\d+-[\da-z]+/g;
export const CORE_TABLE_T11 = ["MUST-T11-1", "MUST-T11-12"] as const;
export const NEW_IN_CORE_00 = ["MUST-T6-7"] as const;
export const NEW_IN_CHECKPOINT_01 = ["MUST-T11-20"] as const;
export const EXPECTED_MUST_COUNT = 92;

export function tableDefinedIds(text: string): string[] {
  return [...text.matchAll(TABLE_ID)].map((m) => m[1]!);
}

export function mustIdsIn(text: string): string[] {
  return [...text.matchAll(MUST_ID)].map((m) => m[0]);
}

export type FamilyDocs = {
  core: string;
  checkpoint: string;
  threats: string;
};

export type IdentityReport = {
  definedBy: Map<string, string[]>;
  mustDefined: string[];
  duplicates: [string, string[]][];
  missing: string[];
  extra: string[];
  coreT11Wrong: string[];
  checkpointT11Missing: string[];
};

function docName(key: keyof FamilyDocs): string {
  return `draft-dogru-cedulon-${key}-00`;
}

function frozenFamilyNames(): FamilyDocs {
  return {
    core: docName("core"),
    checkpoint: docName("checkpoint"),
    threats: docName("threats"),
  };
}

function companionRevision(name: string): number {
  const m = /-(\d+)$/.exec(name);
  return m ? Number(m[1]) : 0;
}

function namedNewFor(names: FamilyDocs): readonly string[] {
  return companionRevision(names.checkpoint) >= 1
    ? [...NEW_IN_CORE_00, ...NEW_IN_CHECKPOINT_01]
    : [...NEW_IN_CORE_00];
}

function reportFamilyIdentitiesNamed(
  docs: FamilyDocs,
  names: FamilyDocs,
  inventory: Iterable<string>,
  expectedMust: Iterable<string> = inventory,
): IdentityReport {
  const numbered = new Set(inventory);
  const expected = new Set(expectedMust);
  const definedBy = new Map<string, string[]>();
  for (const key of ["core", "checkpoint", "threats"] as const) {
    for (const id of tableDefinedIds(docs[key])) {
      const list = definedBy.get(id) ?? [];
      list.push(names[key]);
      definedBy.set(id, list);
    }
  }
  const mustDefined = [...definedBy.keys()].filter((id) => id.startsWith("MUST-")).sort();
  const duplicates = [...definedBy.entries()]
    .filter(([, docsFor]) => docsFor.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));
  const missing = [...numbered].filter((id) => !definedBy.has(id)).sort();
  const extra = mustDefined.filter((id) => !expected.has(id));
  const coreIds = new Set(tableDefinedIds(docs.core));
  const checkpointIds = new Set(tableDefinedIds(docs.checkpoint));
  const coreT11Wrong = CORE_TABLE_T11.filter((id) => !coreIds.has(id));
  const expectedCheckpointT11 = [...expected].filter(
    (id) => /^MUST-T11-/.test(id) && !(CORE_TABLE_T11 as readonly string[]).includes(id),
  );
  const checkpointT11Absent = expectedCheckpointT11.filter((id) => !checkpointIds.has(id));
  return {
    definedBy,
    mustDefined,
    duplicates,
    missing,
    extra,
    coreT11Wrong,
    checkpointT11Missing: checkpointT11Absent,
  };
}

export function reportFamilyIdentities(
  docs: FamilyDocs,
  inventory: Iterable<string>,
): IdentityReport {
  return reportFamilyIdentitiesNamed(docs, frozenFamilyNames(), inventory);
}

type PromisedOn = { ids: readonly string[]; document: string; list: string };

function collectIdentityFailures(
  report: IdentityReport,
  names: FamilyDocs,
  allowedExtra: ReadonlySet<string>,
  promised: readonly PromisedOn[],
  expectedCount: number | undefined,
): string[] {
  const fails: string[] = [];
  if (expectedCount !== undefined && report.mustDefined.length !== expectedCount) {
    fails.push(
      `MUST table rows across the family: ${report.mustDefined.length}, expected ${expectedCount}`,
    );
  }
  for (const [id, docsFor] of report.duplicates) {
    fails.push(`${id} is defined in more than one document: ${docsFor.join(", ")}`);
  }
  for (const id of report.missing) {
    fails.push(`${id} is in the numbered inventory but defined in no family document`);
  }
  for (const id of report.extra) {
    if (!allowedExtra.has(id)) {
      fails.push(`${id} is defined in the family but not in the numbered inventory`);
    }
  }
  for (const { ids, document, list } of promised) {
    for (const id of ids) {
      const definedIn = report.definedBy.get(id) ?? [];
      if (!definedIn.includes(document)) {
        fails.push(`${id} is promised on ${list} and is not defined in ${document}`);
      }
    }
  }
  for (const id of report.coreT11Wrong) {
    fails.push(`${id} must be defined in ${names.core} and is not`);
  }
  for (const id of report.checkpointT11Missing) {
    fails.push(`${id} must be defined in ${names.checkpoint} and is not`);
  }
  return fails;
}

export function identityFailures(report: IdentityReport): string[] {
  const names = frozenFamilyNames();
  return collectIdentityFailures(
    report,
    names,
    new Set<string>(NEW_IN_CORE_00),
    [{ ids: NEW_IN_CORE_00, document: names.core, list: "NEW_IN_CORE_00" }],
    EXPECTED_MUST_COUNT,
  );
}

export function livingFamilyFailures(
  docs: FamilyDocs,
  names: FamilyDocs,
  inventory: Iterable<string>,
): string[] {
  const numbered = [...inventory];
  const namedNew = namedNewFor(names);
  const report = reportFamilyIdentitiesNamed(docs, names, numbered, [...numbered, ...namedNew]);
  const promised: PromisedOn[] = [
    { ids: NEW_IN_CORE_00, document: names.core, list: "NEW_IN_CORE_00" },
  ];
  if (companionRevision(names.checkpoint) >= 1) {
    promised.push({
      ids: NEW_IN_CHECKPOINT_01,
      document: names.checkpoint,
      list: "NEW_IN_CHECKPOINT_01",
    });
  }
  return collectIdentityFailures(report, names, new Set(), promised, undefined);
}

export function assertFamilyIdentities(docs: FamilyDocs, inventory: Iterable<string>): void {
  const fails = identityFailures(reportFamilyIdentities(docs, inventory));
  if (fails.length > 0) {
    throw new Error(fails.join("\n"));
  }
}
