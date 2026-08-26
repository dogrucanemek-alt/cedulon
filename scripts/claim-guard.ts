#!/usr/bin/env node
// Scans published surfaces for a handwritten suite size. The suite prints
// its own total; a second copy in HTML or docs has gone stale three times
// (81 → 97 → 100 → 103 → 114) while the tests stayed green.
//
// This script does not run the suite. It only reads files.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export type Exception = {
  file: string;
  contains: string;
  reason: string;
};

export type ClaimHit = {
  file: string;
  line: number;
  text: string;
};

// A suite-size claim is a number attached to "passing tests" / "tests passing"
// / "tests passed" / "N/N passing". Demo figures such as "100/100 allows" or
// "97-block" do not match.
const CLAIM =
  /(\d+)\s+passing tests|(\d+)\s+tests?\s+passing|all\s+(\d+)\s+tests\s+passed|(\d+)\/(\d+)\s+passing/i;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function publishedFiles(base: string): string[] {
  const site = readdirSync(join(base, "site"))
    .filter((n) => n.endsWith(".html"))
    .map((n) => join("site", n));
  const docs = readdirSync(join(base, "docs"))
    .filter((n) => n.endsWith(".md"))
    .map((n) => join("docs", n));
  return [...site, ...docs, "README.md"];
}

function loadExceptions(base: string): Exception[] {
  const raw = JSON.parse(
    readFileSync(join(base, "scripts", "claim-guard-exceptions.json"), "utf8"),
  ) as Exception[];
  for (const ex of raw) {
    if (!ex.file || !ex.contains || !ex.reason) {
      throw new Error("claim-guard exception is missing file, contains, or reason");
    }
  }
  return raw;
}

export function scanClaims(base = root): { hits: ClaimHit[]; exceptions: Exception[] } {
  const exceptions = loadExceptions(base);
  const hits: ClaimHit[] = [];
  for (const rel of publishedFiles(base)) {
    const text = readFileSync(join(base, rel), "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const normalized = stripTags(lines[i]);
      if (!CLAIM.test(normalized)) continue;
      const excepted = exceptions.some(
        (ex) => ex.file === rel.replace(/\\/g, "/") && normalized.includes(ex.contains),
      );
      if (excepted) continue;
      hits.push({ file: rel.replace(/\\/g, "/"), line: i + 1, text: normalized });
    }
  }
  return { hits, exceptions };
}

const invoked =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const { hits } = scanClaims();
  if (hits.length === 0) {
    process.stdout.write("claim-guard: no handwritten suite-size claims\n");
    process.exit(0);
  }
  for (const hit of hits) {
    process.stderr.write(`${hit.file}:${hit.line}: ${hit.text}\n`);
  }
  process.stderr.write(
    `claim-guard: ${hits.length} handwritten suite-size claim(s). Remove the number; the suite prints its own total.\n`,
  );
  process.exit(1);
}
