import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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

/** A fenced ```bash block immediately followed by a fenced block with no language. */
function documentedRuns(markdown: string): Array<{ command: string; expected: string }> {
  const fences = [...markdown.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map((m) => ({
    lang: m[1],
    body: m[2],
  }));
  const runs: Array<{ command: string; expected: string }> = [];
  for (let i = 0; i < fences.length - 1; i += 1) {
    const [block, next] = [fences[i], fences[i + 1]];
    if (block.lang !== "bash" || next.lang !== "") continue;
    const lines = block.body.trim().split("\n");
    // Only single-command blocks have one output block to compare against.
    if (lines.length !== 1) continue;
    runs.push({ command: lines[0].trim(), expected: next.body.trim() });
  }
  return runs;
}

describe("run-as-verifier doc", () => {
  const runs = documentedRuns(doc);

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
