#!/usr/bin/env node
// Tracked text blobs must not carry CR (0x0D). Windows checkout with
// core.autocrlf=true has already bitten the fence parser; this guard
// checks the object store, not the working tree.
//
// spec/ is read and must be clean. This script never writes to the tree;
// git's request list goes to a private temporary directory.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runBounded } from "./bounded-run.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const GIT_TIMEOUT_MS = 60_000;
const LIST_OUTPUT_BYTES = 16 * 1024 * 1024;
/** Every tracked blob arrives in this one stream. */
const BLOB_OUTPUT_BYTES = 64 * 1024 * 1024;

export type BinaryException = {
  file: string;
  reason: string;
};

/** Tracked binaries. A 0x0D in these is payload, not a line ending. */
export const BINARY_EXCEPTIONS: BinaryException[] = [
  {
    file: "site/og.png",
    reason: "PNG raster; a 0x0D byte is image data, not a line ending.",
  },
];

export type CrHit = {
  file: string;
  count: number;
};

const BINARY_EXT = /\.(png|pdf|bin)$/i;

export function isBinaryPath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  if (BINARY_EXCEPTIONS.some((ex) => ex.file === normalized)) {
    return true;
  }
  return BINARY_EXT.test(normalized);
}

export function countCarriageReturns(bytes: Buffer): number {
  let n = 0;
  for (const b of bytes) {
    if (b === 0x0d) n += 1;
  }
  return n;
}

export function looksBinary(bytes: Buffer): boolean {
  return bytes.includes(0);
}

export async function trackedFiles(base = root): Promise<string[]> {
  const { stdout } = await runBounded({
    label: "git ls-files",
    command: "git",
    args: ["ls-files", "-z"],
    cwd: base,
    timeoutMs: GIT_TIMEOUT_MS,
    maxOutputBytes: LIST_OUTPUT_BYTES,
  });
  return stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, "/"));
}

export async function blobsOf(files: string[], base = root): Promise<Map<string, Buffer>> {
  if (files.length === 0) return new Map();
  let scratch: string | undefined;
  let raw: Buffer;
  try {
    scratch = mkdtempSync(join(tmpdir(), "cedulon-blobs-"));
    const requests = join(scratch, "requests");
    writeFileSync(requests, files.map((f) => `:${f}`).join("\n") + "\n");
    ({ stdout: raw } = await runBounded({
      label: "git cat-file --batch",
      command: "git",
      args: ["cat-file", "--batch"],
      cwd: base,
      timeoutMs: GIT_TIMEOUT_MS,
      stdinPath: requests,
      maxOutputBytes: BLOB_OUTPUT_BYTES,
    }));
  } finally {
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  }
  const out = new Map<string, Buffer>();
  let offset = 0;
  for (const file of files) {
    const nl = raw.indexOf(0x0a, offset);
    if (nl < 0) throw new Error(`crlf-guard: missing header for ${file}`);
    const header = raw.subarray(offset, nl).toString("utf8");
    const parts = header.split(" ");
    if (parts[1] !== "blob") {
      throw new Error(`crlf-guard: ${file} is ${parts[1] ?? "missing"}, not a blob`);
    }
    const size = Number(parts[2]);
    const start = nl + 1;
    out.set(file, raw.subarray(start, start + size));
    offset = start + size + 1;
  }
  return out;
}

export async function findCarriageReturns(
  base = root,
  extra: Array<{ file: string; bytes: Buffer }> = [],
): Promise<CrHit[]> {
  const hits: CrHit[] = [];
  const files = await trackedFiles(base);
  const blobs = await blobsOf(files, base);
  for (const file of files) {
    if (isBinaryPath(file)) continue;
    const bytes = blobs.get(file);
    if (!bytes) throw new Error(`crlf-guard: no blob for ${file}`);
    if (looksBinary(bytes)) continue;
    const count = countCarriageReturns(bytes);
    if (count > 0) {
      hits.push({ file, count });
    }
  }
  for (const item of extra) {
    const file = item.file.replace(/\\/g, "/");
    if (isBinaryPath(file) || looksBinary(item.bytes)) continue;
    const count = countCarriageReturns(item.bytes);
    if (count > 0) {
      hits.push({ file, count });
    }
  }
  return hits;
}

const invoked =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const hits = await findCarriageReturns();
  if (hits.length > 0) {
    for (const hit of hits) {
      console.error(`crlf-guard: ${hit.file} has ${hit.count} CR byte(s)`);
    }
    process.exit(1);
  }
  console.log("crlf-guard: no CR in tracked text blobs");
}
