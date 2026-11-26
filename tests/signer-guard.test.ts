import { strict as assert } from "node:assert";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { KILL_GRACE_MS, runBounded } from "../scripts/bounded-run.ts";
import { scanSignerHits } from "../scripts/signer-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The gate script, measured on Windows at 0.1 s. */
const GATE_TIMEOUT_MS = 30_000;

describe("signer-guard", () => {
  it("RED then GREEN: a PEM handed to crypto.sign outside pemSigner is refused", () => {
    const red = scanSignerHits(root, [
      {
        file: "packages/probe/src/leak.ts",
        text: "const signature = sign(null, payload, privateKeyPem);\n",
      },
    ]);
    assert.ok(
      red.some((h) => h.file === "packages/probe/src/leak.ts" && /node:crypto sign/.test(h.why)),
      `expected a hit on the PEM-to-sign probe, got ${JSON.stringify(red)}`,
    );

    const green = scanSignerHits(root);
    assert.deepEqual(
      green,
      [],
      green.map((h) => `${h.file}:${h.line}: ${h.why}`).join("\n"),
    );
  });

  it("the gate script is the same scan (exit 0)", { timeout: GATE_TIMEOUT_MS + KILL_GRACE_MS + 10_000 }, async () => {
    const { stdout } = await runBounded({
      label: "signer-guard gate",
      command: process.execPath,
      args: ["--experimental-strip-types", "scripts/signer-guard.ts"],
      cwd: root,
      timeoutMs: GATE_TIMEOUT_MS,
      maxOutputBytes: 1024 * 1024,
    });
    assert.match(stdout.toString("utf8"), /signer-guard: no PEM string reaches crypto\.sign outside pemSigner/);
  });
});
