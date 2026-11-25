/**
 * Every `{{x}}` in a publication-bound draft must resolve to a `{#x}`
 * anchor in that document or to a bibliography key under its YAML
 * `normative:` / `informative:` blocks. A dangling cross-reference is a
 * broken publication cite, not a style preference.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  companionDraftPaths,
  core00FamilyPaths,
  latestDraftPath,
} from "./latest-draft.ts";

export type CrossRefHit = {
  file: string;
  line: number;
  ref: string;
};

/** Newest living drafts that go (or will go) to the datatracker. */
export function publicationDraftPaths(root: string): string[] {
  const paths = [
    latestDraftPath(root),
    ...core00FamilyPaths(root),
    ...companionDraftPaths(root),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out.sort((a, b) => basename(a).localeCompare(basename(b)));
}

/**
 * Anchors (`{#id}`) plus top-level keys of the normative/informative
 * YAML maps. Nested fields under a reference entry are not keys.
 */
export function resolvableIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const m of text.matchAll(/\{#([A-Za-z0-9._-]+)\}/g)) {
    ids.add(m[1]!);
  }
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (fm === null) return ids;
  let mode: "refs" | null = null;
  for (const line of fm[1]!.split(/\r?\n/)) {
    if (/^(normative|informative):\s*$/.test(line)) {
      mode = "refs";
      continue;
    }
    if (mode === "refs" && /^[A-Za-z]/.test(line)) {
      mode = null;
    }
    if (mode !== "refs") continue;
    const key = /^\s{2}([A-Za-z0-9._-]+):\s*(.*)$/.exec(line);
    if (key) ids.add(key[1]!);
  }
  return ids;
}

export function collectCrossRefs(text: string): Array<{ ref: string; index: number }> {
  const out: Array<{ ref: string; index: number }> = [];
  for (const m of text.matchAll(/\{\{([A-Za-z0-9._-]+)\}\}/g)) {
    out.push({ ref: m[1]!, index: m.index! });
  }
  return out;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}

export function crossRefFailures(text: string, fileLabel: string): CrossRefHit[] {
  const ids = resolvableIds(text);
  const hits: CrossRefHit[] = [];
  const seen = new Set<string>();
  for (const { ref, index } of collectCrossRefs(text)) {
    if (ids.has(ref)) continue;
    const key = `${fileLabel}:${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ file: fileLabel, line: lineOf(text, index), ref });
  }
  return hits;
}

export function publicationCrossRefFailures(root: string): CrossRefHit[] {
  const hits: CrossRefHit[] = [];
  for (const path of publicationDraftPaths(root)) {
    const text = readFileSync(path, "utf8");
    hits.push(...crossRefFailures(text, basename(path)));
  }
  return hits;
}

export function assertPublicationCrossRefs(root: string): void {
  const hits = publicationCrossRefFailures(root);
  if (hits.length > 0) {
    throw new Error(
      hits.map((h) => `${h.file}:${h.line}: unresolved {{${h.ref}}}`).join("\n"),
    );
  }
}

/** Convenience for a single in-memory probe (RED fixtures). */
export function unresolvedRefs(text: string): string[] {
  return crossRefFailures(text, "probe").map((h) => h.ref);
}
