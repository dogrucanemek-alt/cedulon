import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { scanClaims } from "../scripts/claim-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("claim-guard", () => {
  it("exceptions carry a reason so the next reader does not treat them as mistakes", () => {
    const { exceptions } = scanClaims(root);
    assert.ok(exceptions.length > 0, "expected a documented exception list");
    for (const ex of exceptions) {
      assert.ok(ex.reason.length > 20, `${ex.file}: exception reason is too short to stand alone`);
    }
  });

  it("published surfaces do not hand-write the suite size", () => {
    const { hits } = scanClaims(root);
    assert.deepEqual(
      hits,
      [],
      hits.map((h) => `${h.file}:${h.line}: ${h.text}`).join("\n"),
    );
  });

  it("the gate script is the same scan (exit 0)", () => {
    const stdout = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/claim-guard.ts"],
      { cwd: root, encoding: "utf8" },
    );
    assert.match(stdout, /claim-guard: no handwritten suite-size claims/);
  });
});
