/**
 * Tests leave nothing in the operating system's temp directory.
 *
 * Measured 2026-11-26: one `npm run test:all` added 78 `cedulon-*` entries to
 * os.tmpdir() and removed none. Each test opened a directory with mkdtemp and
 * nothing took it away again.
 *
 * Two checks hold the line:
 *
 *  - Static: no source under tests/ calls mkdtemp or tmpdir() itself. Every
 *    test directory comes from tests/helpers/temp-dir.ts, which registers its
 *    removal on the test that opened it. A file that needs to differ is named
 *    in TEMP_DIR_EXCEPTIONS with its reason.
 *  - Dynamic: `test:pre-release` records the `cedulon-*` names in the temp
 *    directory before the suite (scripts/suite-run-start.ts), and this gate,
 *    run after the suite, refuses the run if any name added since is still
 *    there. Names that were there before the run are not counted.
 */

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

/** Every temp entry this repository's tests and scripts create starts with this. */
export const TEMP_ENTRY_PREFIX = "cedulon-";

/** Written beside the run start marker; read and removed by the gate. */
export const SUITE_TEMP_ENTRIES_PATH = ".suite-temp-entries";

/** Files under tests/ allowed to open a temp directory themselves, and why. */
export const TEMP_DIR_EXCEPTIONS: Readonly<Record<string, string>> = {
  "tests/helpers/temp-dir.ts":
    "the helper: the one place a test directory is opened and its removal registered on the test",
};

const DIRECT_TEMP: ReadonlyArray<{ pattern: RegExp; detail: string }> = [
  { pattern: /\bmkdtemp(?:Sync)?\s*\(/, detail: "calls mkdtemp directly instead of tempDir(t, prefix)" },
  {
    pattern: /\bimport\s*\{[^}]*\bmkdtemp(?:Sync)?\b[^}]*\}\s*from\s*["'](?:node:)?fs(?:\/promises)?["']/,
    detail: "imports mkdtemp; open test directories with tempDir(t, prefix)",
  },
  { pattern: /\btmpdir\s*\(/, detail: "builds a path under tmpdir() by hand instead of tempDir(t, prefix)" },
];

export type TempDirHit = { file: string; detail: string };

export function directTempDirFailures(text: string, fileLabel: string): TempDirHit[] {
  return DIRECT_TEMP.filter(({ pattern }) => pattern.test(text)).map(({ detail }) => ({ file: fileLabel, detail }));
}

function listTestSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name === "fixtures" || name === "jcs-vectors" || name === "node_modules") continue;
        walk(path);
        continue;
      }
      if (/\.(?:[cm]?ts|[cm]?js)$/.test(name)) out.push(path);
    }
  };
  walk(join(root, "tests"));
  return out.sort();
}

/**
 * Scan every source under tests/ (fixtures/ excluded). An exception that no
 * longer covers a hit is reported as well, so the list cannot outlive its
 * reason.
 */
export function scanTestsForDirectTempDirs(
  root: string,
  exceptions: Readonly<Record<string, string>> = TEMP_DIR_EXCEPTIONS,
): TempDirHit[] {
  const hits: TempDirHit[] = [];
  const used = new Set<string>();
  for (const path of listTestSources(root)) {
    const rel = relative(root, path).replace(/\\/g, "/");
    const found = directTempDirFailures(readFileSync(path, "utf8"), rel);
    if (found.length === 0) continue;
    if (rel in exceptions) {
      used.add(rel);
      continue;
    }
    hits.push(...found);
  }
  for (const rel of Object.keys(exceptions)) {
    if (!used.has(rel)) {
      hits.push({ file: rel, detail: "is named in TEMP_DIR_EXCEPTIONS but opens no temp directory; drop the exception" });
    }
  }
  return hits;
}

/** The `cedulon-*` names directly under `dir`, sorted. */
export function tempEntries(dir: string = tmpdir()): string[] {
  return readdirSync(dir)
    .filter((name) => name.startsWith(TEMP_ENTRY_PREFIX))
    .sort();
}

export type TempSnapshot = { tmpdir: string; entries: string[] };

export function formatTempSnapshot(snapshot: TempSnapshot): string {
  return `${JSON.stringify(snapshot, null, 1)}\n`;
}

export function parseTempSnapshot(raw: string): TempSnapshot {
  const parsed = JSON.parse(raw) as Partial<TempSnapshot>;
  if (typeof parsed.tmpdir !== "string" || !Array.isArray(parsed.entries)) {
    throw new Error("the temp snapshot does not name a temp directory and its entries");
  }
  return { tmpdir: parsed.tmpdir, entries: parsed.entries.map(String) };
}

/** Record the `cedulon-*` names present now, for the gate to compare against. */
export function writeTempSnapshot(path: string, dir: string = tmpdir()): TempSnapshot {
  const snapshot = { tmpdir: dir, entries: tempEntries(dir) };
  writeFileSync(path, formatTempSnapshot(snapshot), "utf8");
  return snapshot;
}

/** Names present after the run that were not present before it. */
export function addedTempEntries(before: readonly string[], after: readonly string[]): string[] {
  const seen = new Set(before);
  return after.filter((name) => !seen.has(name)).sort();
}

export function runTempLeakGate(args: {
  snapshotPath: string;
  tempRoot?: string;
  unlink?: (path: string) => void;
}): { ok: true; before: number; after: number } | { ok: false; errors: string[] } {
  if (!existsSync(args.snapshotPath)) {
    return {
      ok: false,
      errors: [`temp-leak: no temp snapshot at ${args.snapshotPath}; run scripts/suite-run-start.ts before the suite`],
    };
  }
  let snapshot: TempSnapshot;
  try {
    snapshot = parseTempSnapshot(readFileSync(args.snapshotPath, "utf8"));
    (args.unlink ?? unlinkSync)(args.snapshotPath);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [`temp-leak: the temp snapshot at ${args.snapshotPath} could not be used: ${detail}`] };
  }
  const root = args.tempRoot ?? tmpdir();
  if (root !== snapshot.tmpdir) {
    return {
      ok: false,
      errors: [`temp-leak: the snapshot was taken in ${snapshot.tmpdir}, but the temp directory is now ${root}`],
    };
  }
  const after = tempEntries(root);
  const added = addedTempEntries(snapshot.entries, after);
  if (added.length > 0) {
    return {
      ok: false,
      errors: [
        `temp-leak: ${added.length} ${TEMP_ENTRY_PREFIX}* entries were added to ${root} during this run and are still there:`,
        ...added.map((name) => `  ${name}`),
      ],
    };
  }
  return { ok: true, before: snapshot.entries.length, after: after.length };
}

function main(): void {
  const snapshotPath = process.argv[2] ?? process.env.SUITE_TEMP_ENTRIES ?? SUITE_TEMP_ENTRIES_PATH;
  const result = runTempLeakGate({ snapshotPath });
  if (!result.ok) {
    for (const line of result.errors) console.error(line);
    process.exit(1);
  }
  console.log(
    `temp-leak: the run left nothing in the temp directory - ${result.before} ${TEMP_ENTRY_PREFIX}* entries before, ${result.after} after`,
  );
}

if (import.meta.filename === process.argv[1]) main();
