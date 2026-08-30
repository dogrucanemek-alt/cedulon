#!/usr/bin/env node
// Production code may keep a PEM on disk and hand it to pemSigner. It may
// not pass that string into node:crypto sign() itself. The one body allowed
// to do that is pemSigner; state load/save may still assign the field.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export type SignerHit = {
  file: string;
  line: number;
  text: string;
  why: string;
};

const CRYPTO_SIGN = /\bsign\s*\(\s*null\b/;
// Stop at `;` so a later `this.keys.receiptPrivatePem =` in load/save
// is not treated as an argument to the sign call above it.
const LIVE_PEM_TO_SIGN =
  /\b(?:signReceipt(?:Json|Cose)?|signCheckpoint|signCoseSign1)\s*\([^;]{0,1500}?\breceiptPrivatePem\b/;

const PEM_SIGNER_FILE = "packages/cose/src/signer.ts";

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkTs(full, out);
      continue;
    }
    if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function productionSources(base: string): string[] {
  const packages = join(base, "packages");
  const out: string[] = [];
  for (const name of readdirSync(packages)) {
    const src = join(packages, name, "src");
    try {
      if (statSync(src).isDirectory()) walkTs(src, out);
    } catch {
      continue;
    }
  }
  return out;
}

export function scanSignerHits(
  base = root,
  extra: { file: string; text: string }[] = [],
): SignerHit[] {
  const hits: SignerHit[] = [];
  const files = [
    ...productionSources(base).map((full) => ({
      file: relative(base, full).replace(/\\/g, "/"),
      text: readFileSync(full, "utf8"),
    })),
    ...extra,
  ];
  for (const { file, text } of files) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (!CRYPTO_SIGN.test(lines[i]!)) continue;
      if (file === PEM_SIGNER_FILE) continue;
      hits.push({
        file,
        line: i + 1,
        text: lines[i]!.trim(),
        why: "node:crypto sign() still takes a PEM string; only pemSigner may do that",
      });
    }
    if (LIVE_PEM_TO_SIGN.test(text)) {
      const idx = text.search(LIVE_PEM_TO_SIGN);
      const line = text.slice(0, idx).split(/\r?\n/).length;
      hits.push({
        file,
        line,
        text: lines[line - 1]!.trim(),
        why: "the live receipt PEM is passed to a sign function; wrap it in pemSigner first",
      });
    }
  }
  return hits;
}

const invoked =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const hits = scanSignerHits();
  if (hits.length === 0) {
    process.stdout.write("signer-guard: no PEM string reaches crypto.sign outside pemSigner\n");
    process.exit(0);
  }
  for (const hit of hits) {
    process.stderr.write(`${hit.file}:${hit.line}: ${hit.why} (${hit.text})\n`);
  }
  process.stderr.write(`signer-guard: ${hits.length} PEM-to-sign flow(s)\n`);
  process.exit(1);
}
