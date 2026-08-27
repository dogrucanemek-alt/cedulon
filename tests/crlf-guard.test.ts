import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BINARY_EXCEPTIONS,
  countCarriageReturns,
  findCarriageReturns,
  isBinaryPath,
  trackedFiles,
} from "../scripts/crlf-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("crlf-guard", () => {
  it("exceptions name a file and a reason", () => {
    assert.ok(BINARY_EXCEPTIONS.length > 0);
    for (const ex of BINARY_EXCEPTIONS) {
      assert.ok(ex.file.length > 0);
      assert.ok(ex.reason.length > 20, `${ex.file}: reason is too short`);
      assert.equal(isBinaryPath(ex.file), true);
    }
  });

  it("RED then GREEN: a CRLF text blob is rejected, then the tree is clean", () => {
    const probe = Buffer.from("hello\r\nworld\n", "utf8");
    assert.ok(countCarriageReturns(probe) > 0);
    const red = findCarriageReturns(root, [{ file: "tests/.crlf-guard-probe.txt", bytes: probe }]);
    assert.ok(
      red.some((h) => h.file === "tests/.crlf-guard-probe.txt" && h.count > 0),
      `expected a hit on the CRLF probe, got ${JSON.stringify(red)}`,
    );
    const green = findCarriageReturns(root);
    assert.deepEqual(green, [], green.map((h) => `${h.file}:${h.count}`).join("\n"));
  });

  it("reads spec/ and does not rewrite it", () => {
    const spec = trackedFiles(root).filter((f) => f.startsWith("spec/"));
    assert.ok(spec.length > 0, "expected frozen drafts to be tracked");
    const hits = findCarriageReturns(root).filter((h) => h.file.startsWith("spec/"));
    assert.deepEqual(hits, []);
    const diff = execFileSync("git", ["diff", "--", "spec"], { cwd: root, encoding: "utf8" });
    assert.equal(diff, "");
  });

  it("the gate script is the same scan (exit 0)", () => {
    const stdout = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/crlf-guard.ts"],
      { cwd: root, encoding: "utf8" },
    );
    assert.match(stdout, /crlf-guard: no CR in tracked text blobs/);
  });

  it(".gitattributes does not attach a rule to spec/", () => {
    const attrs = readFileSync(join(root, ".gitattributes"), "utf8");
    for (const line of attrs.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      assert.equal(trimmed.startsWith("spec/") || trimmed.startsWith("/spec/"), false, trimmed);
    }
  });
});
