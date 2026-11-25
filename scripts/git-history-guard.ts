/**
 * Refuse tests that read historical git objects. Hosted runners check out
 * shallowly, and squash-merged commits never exist on the default branch, so a
 * test that calls `git show <sha>:path` fails before its assertion runs.
 *
 * The guard measures test sources under tests/: no `git show`, `git cat-file`,
 * `git log -p`, and no 7–40 hex commit id followed by `:` and a path.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Shell form, argv form (`"git", ["show", ...]`), or flat argv (`"git", "show"`). */
const FORBIDDEN_CMD =
  /\bgit\s+(?:show|cat-file|log\s+-p)\b|["']git["']\s*,\s*\[?\s*["'](?:show|cat-file)["']|["']git["']\s*,\s*["']log["']\s*,\s*["']-p["']/;
/** `7f9412c:spec/...` or `HEAD:spec/...` style object reads (path has a slash). */
const FORBIDDEN_REV_PATH =
  /(?:\bHEAD\b|\b[0-9a-f]{7,40}):(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._/-]+/;

export type GitHistoryHit = { file: string; detail: string };

export function gitHistoryDependencyFailures(text: string, fileLabel: string): GitHistoryHit[] {
  const hits: GitHistoryHit[] = [];
  if (FORBIDDEN_CMD.test(text)) {
    hits.push({ file: fileLabel, detail: "invokes git show / git cat-file / git log -p" });
  }
  if (FORBIDDEN_REV_PATH.test(text)) {
    hits.push({ file: fileLabel, detail: "reads a git object via <rev>:<path>" });
  }
  return hits;
}

function listTestSources(root: string): string[] {
  const testsDir = join(root, "tests");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) {
        if (name === "fixtures" || name === "jcs-vectors" || name === "node_modules") continue;
        walk(path);
        continue;
      }
      if (/\.test\.ts$/.test(name)) out.push(path);
    }
  };
  walk(testsDir);
  // This suite names the forbidden commands in its own assertions; measure every
  // other test file, and hold the probe fixture against the checker separately.
  return out.filter((p) => !/[\\/]git-history-guard\.test\.ts$/.test(p));
}

/** Scan every test source under tests/ (fixtures/ excluded). */
export function scanTestsForGitHistory(root: string): GitHistoryHit[] {
  const hits: GitHistoryHit[] = [];
  for (const path of listTestSources(root)) {
    const rel = relative(root, path).replace(/\\/g, "/");
    const text = readFileSync(path, "utf8");
    hits.push(...gitHistoryDependencyFailures(text, rel));
  }
  return hits;
}
