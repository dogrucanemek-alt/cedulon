/**
 * The one place a test opens a directory under the operating system's temp
 * directory. Every directory opened here is removed when the test that opened
 * it ends, passed or failed. Before this, a single suite run left 78
 * `cedulon-*` entries behind.
 */
import { chmodSync, existsSync, lstatSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

type RemoveOptions = { rm?: typeof rmSync };

/**
 * Open `<tmpdir>/<prefix>XXXXXX` and register its removal on `t`. Pass the
 * context of the step that uses the directory: a subtest's own `t`, not its
 * parent's, so the directory goes when that step ends.
 *
 * A cleanup failure turns the test red. A directory that outlives its test is
 * a leak whatever the assertions said, and a quiet pass is how the leaks piled
 * up unseen.
 */
export function tempDir(t: Pick<TestContext, "after">, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => removeTempDir(dir));
  return dir;
}

/** Remove `dir` and everything under it, or throw saying why it could not. */
export function removeTempDir(dir: string, { rm = rmSync }: RemoveOptions = {}): void {
  try {
    reopen(dir);
    // A scanner or indexer can hold a fresh file open for a moment on Windows;
    // a short retry is not a pass, the existence check below still decides.
    rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`temp directory ${dir} could not be removed: ${detail}`);
  }
  if (existsSync(dir)) {
    throw new Error(`temp directory ${dir} is still present after removal`);
  }
}

/**
 * Give the owner back what a test took away on purpose, so removal is not
 * refused by it: mode 0700 on directories and 0600 on files on POSIX; on
 * Windows the same calls clear the read-only attribute. Symbolic links are
 * not followed. A deny entry a test adds to an ACL is restored by that test.
 */
function reopen(path: string): void {
  let isDirectory: boolean;
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) return;
    isDirectory = st.isDirectory();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (!isDirectory) {
    chmodSync(path, 0o600);
    return;
  }
  chmodSync(path, 0o700);
  for (const name of readdirSync(path)) reopen(join(path, name));
}
