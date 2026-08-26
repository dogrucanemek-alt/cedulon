import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { documentedRuns } from "./doc-runs.ts";

// docs/RUN_AS_VERIFIER.md prints the exact stdout an outside verifier should
// see, and outside verifiers have been pointed at it. Those blocks are a second
// copy of what the demos produce, so they go stale silently: adding the
// `guarantee` column to the bypass output left the documented four lines wrong
// while every test stayed green.
//
// This runs each documented command and compares the real output to the block
// printed under it.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(root, "docs", "RUN_AS_VERIFIER.md"), "utf8");

describe("run-as-verifier doc", () => {
  const runs = documentedRuns(doc);

  // The file shipped with two sections numbered 6, and inserting a section
  // silently moved the targets of its own cross-references.
  const sections = [...doc.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]));

  it("numbers its sections 1..n once each", () => {
    assert.deepEqual(
      sections,
      sections.map((_, i) => i + 1),
    );
  });

  it("does not restate the suite size", () => {
    // Twice this file named a count the suite had already moved past. The run
    // prints its own total; a second copy here only goes stale.
    const claim = doc.match(/\*?\*?\d+\*?\*?\s+tests?\s+passing/i);
    assert.equal(
      claim,
      null,
      `remove the hard-coded count ${JSON.stringify(claim?.[0])}: it goes stale on the next test added`,
    );
  });

  it("cross-references sections that exist", () => {
    const referenced = [...doc.matchAll(/[Ss]ection (\d+)/g)].map((m) => Number(m[1]));
    assert.notEqual(referenced.length, 0, "expected the doc to cross-reference its sections");
    for (const n of referenced) {
      assert.ok(sections.includes(n), `text points at section ${n}, which does not exist`);
    }
  });

  it("documents the commands it claims to", () => {
    assert.deepEqual(
      runs.map((r) => r.command),
      ["npm run audit", "npm run demo:bypass", "npm run demo:bypasses"],
      "the doc's runnable command/output pairs changed; update this list deliberately",
    );
  });

  for (const { command, expected } of runs) {
    it(`${command} prints what the doc says`, () => {
      const script = command.replace(/^npm run /, "");
      assert.match(script, /^[a-z:]+$/, "only npm scripts are run from the doc");
      let stdout: string;
      try {
        stdout = execFileSync("npm", ["run", script, "--silent"], {
          cwd: root,
          encoding: "utf8",
          shell: process.platform === "win32",
        });
      } catch (e) {
        // The bypass demos exit non-zero by design; their stdout is the subject.
        stdout = (e as { stdout?: string }).stdout ?? "";
      }
      assert.equal(stdout.trim().replace(/\r\n/g, "\n"), expected);
    });
  }
});
