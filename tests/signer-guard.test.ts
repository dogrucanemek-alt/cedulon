import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { scanSignerHits } from "../scripts/signer-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

  it("the gate script is the same scan (exit 0)", () => {
    const stdout = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/signer-guard.ts"],
      { cwd: root, encoding: "utf8" },
    );
    assert.match(stdout, /signer-guard: no PEM string reaches crypto\.sign outside pemSigner/);
  });
});
