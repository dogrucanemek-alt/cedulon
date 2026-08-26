import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { documentedRuns, runDocumentedCommand } from "./doc-runs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(root, "docs", "INTEROP_RUN.md"), "utf8");

describe("interop-run doc", () => {
  const runs = documentedRuns(doc);
  const required = runs.filter((r) => !r.optional);

  it("does not restate the suite size", () => {
    const claim = doc.match(/\*?\*?\d+\*?\*?\s+tests?\s+passing/i);
    assert.equal(claim, null, `remove the hard-coded count ${JSON.stringify(claim?.[0])}`);
  });

  it("pins a commit this clone can actually check out", () => {
    const pin = doc.match(/^PIN=([0-9a-f]{7,40})$/m)?.[1];
    assert.ok(pin, "the doc must carry a PIN= line");
    // A rewritten or never-pushed SHA reaches the runner as a dead pin.
    // Resolving it here is what a runner's `git checkout` would do.
    const type = execFileSync("git", ["cat-file", "-t", `${pin}^{commit}`], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    assert.equal(type, "commit", `PIN=${pin} does not resolve to a commit`);
    execFileSync("git", ["merge-base", "--is-ancestor", pin, "HEAD"], { cwd: root });
  });

  it("names the required commands", () => {
    assert.deepEqual(
      required.map((r) => r.command),
      ["npx tsc --noEmit", "npm run audit", "npm run demo:bypass", "npm run demo:bypasses"],
    );
  });

  it("marks the network steps optional so the suite does not fetch", () => {
    assert.deepEqual(
      runs.filter((r) => r.optional).map((r) => r.command),
      ["npx -y @cedulon/mcp-server", "npm run demo:live"],
    );
  });

  it("documents test:all without a replayable expected-output fence", () => {
    assert.match(doc, /npm run test:all/);
    assert.equal(
      runs.some((r) => r.command === "npm run test:all"),
      false,
      "a fenced expected-output for test:all would recurse into this suite",
    );
  });

  for (const { command, expected } of required) {
    it(`${command} prints what the doc says`, () => {
      const stdout = runDocumentedCommand(command, root);
      assert.equal(stdout, expected);
    });
  }
});
