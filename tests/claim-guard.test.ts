import { strict as assert } from "node:assert";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { KILL_GRACE_MS, runBounded } from "../scripts/bounded-run.ts";
import { scanClaims } from "../scripts/claim-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The gate script, measured on Windows at 0.1 s. */
const GATE_TIMEOUT_MS = 30_000;

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

  it("the gate script is the same scan (exit 0)", { timeout: GATE_TIMEOUT_MS + KILL_GRACE_MS + 10_000 }, async () => {
    const { stdout } = await runBounded({
      label: "claim-guard gate",
      command: process.execPath,
      args: ["--experimental-strip-types", "scripts/claim-guard.ts"],
      cwd: root,
      timeoutMs: GATE_TIMEOUT_MS,
      maxOutputBytes: 1024 * 1024,
    });
    assert.match(stdout.toString("utf8"), /claim-guard: no handwritten suite-size claims/);
  });
});
