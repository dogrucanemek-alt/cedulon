import { strict as assert } from "node:assert";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename } from "node:path";
import { describe, it } from "node:test";

import { ROOT_PREFIX } from "../scripts/with-temp-root.ts";

const REFUSAL = "the suite must run through scripts/with-temp-root.ts";

/**
 * `path` as the file system names it: links, Windows 8.3 short names and
 * macOS's /var -> /private/var resolved. Windows paths compare without case.
 */
function canonical(path: string): { real: string; key: string } {
  const real = realpathSync.native(path);
  return { real, key: process.platform === "win32" ? real.toLowerCase() : real };
}

// Every run that lists this file, wherever it is started from, is refused
// unless with-temp-root opened its temp directory. Its own top-level suite:
// the impl-status gate counts <testcase> elements against suite attributes.
describe("this run is inside the temp root with-temp-root opened for it", () => {
  it("CEDULON_TEMP_ROOT is set, is os.tmpdir(), and is a root with-temp-root opened", () => {
    const named = process.env.CEDULON_TEMP_ROOT;
    assert.ok(named, `${REFUSAL}: CEDULON_TEMP_ROOT is not set`);
    let root: { real: string; key: string };
    try {
      root = canonical(named);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      assert.fail(`${REFUSAL}: CEDULON_TEMP_ROOT names ${named}, which cannot be resolved: ${detail}`);
    }
    assert.equal(canonical(tmpdir()).key, root.key, `${REFUSAL}: os.tmpdir() is ${tmpdir()}, not CEDULON_TEMP_ROOT ${named}`);
    assert.ok(basename(root.real).startsWith(ROOT_PREFIX), `${REFUSAL}: ${root.real} is not a root it opened`);
  });
});
