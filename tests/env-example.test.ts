import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("env example", () => {
  it("43 RED then GREEN: .env.example lists exactly the variables the code reads", () => {
    // Two hand-written statements of the same fact drift, and each file stays
    // consistent with itself while they do: the example listed three variables
    // that no longer existed and none of the ones that did.
    const declared = new Set(
      readFileSync(join(root, ".env.example"), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.split("=")[0]),
    );

    const used = new Set<string>();
    for (const dir of ["packages", "examples"]) {
      for (const file of sourceFiles(join(root, dir))) {
        // Only names the process actually reads from the environment. The demo
        // export also writes `window.CEDULON_BALANCED`, which is a browser
        // global with a similar name and nothing to configure.
        const text = readFileSync(file, "utf8");
        const patterns = [
          // `env` here is either `process.env` or a parameter holding it.
          /env\.(CEDULON_[A-Z_]+)/g,
          /env\[["'](CEDULON_[A-Z_]+)["']\]/g,
          /(?:envOr|optionalList)\(\s*"(CEDULON_[A-Z_]+)"/g,
        ];
        for (const pattern of patterns) {
          for (const match of text.matchAll(pattern)) {
            used.add(match[1]);
          }
        }
        // Destructuring names the variables without `env` beside each one, and a
        // single capture group would only ever see the first of them.
        for (const block of text.matchAll(/\{([^{}]*)\}\s*=\s*(?:process\.)?env\b/g)) {
          for (const name of block[1].matchAll(/CEDULON_[A-Z_]+/g)) {
            used.add(name[0]);
          }
        }
      }
    }

    assert.deepEqual(
      [...used].filter((name) => !declared.has(name)).sort(),
      [],
      "variables the code reads but the example never mentions",
    );
    assert.deepEqual(
      [...declared].filter((name) => !used.has(name)).sort(),
      [],
      "variables the example offers but nothing reads",
    );
  });
});
