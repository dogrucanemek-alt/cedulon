import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

// The package entry starts a stdio server on import; the session is the unit
// under test here.
import { CedulonSession } from "../packages/mcp-server/src/session.ts";

function tempStatePath(): string {
  return join(mkdtempSync(join(tmpdir(), "cedulon-state-")), "nested", "state.json");
}

function spendOnce(session: CedulonSession, nonce: string) {
  return session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce, tool: "spend" }, 1);
}

describe("session state file", () => {
  it("40 RED then GREEN: the state file holding the private key is not world-readable", (t) => {
    // The receipt private key is written into this file in the clear. On POSIX
    // there is no ambient per-user secret to encrypt it with, so the file mode
    // is the whole of the protection - which makes an unstated mode a decision,
    // not an omission. (Windows does hold such a secret - DPAPI - which is why
    // its skip below is a feature gap with a named exit, not a shrug.)
    const statePath = tempStatePath();
    const session = new CedulonSession({ statePath });
    assert.equal(spendOnce(session, "n0".padEnd(16, "-")).ok, true);

    const saved = JSON.parse(readFileSync(statePath, "utf8"));
    assert.ok(saved.keys.receiptPrivatePem.includes("PRIVATE KEY"), "the key really is in there");

    if (process.platform === "win32") {
      // Measured, not assumed: on Windows the same call leaves 0666 and the mode
      // bits are not the access control - the directory ACL is, and this project
      // does not set it. Asserting 0600 here would be a green light for a
      // protection that is not present on this platform.
      t.skip("POSIX file mode is not the access control on Windows; the directory ACL is, and this server does not set it");
      return;
    }
    assert.equal(statSync(statePath).mode & 0o777, 0o600, "state file is owner-only");
    assert.equal(
      statSync(join(statePath, "..")).mode & 0o777,
      0o700,
      "the directory the server created is owner-only too",
    );
  });

  it("41 RED then GREEN: a save that fails midway cannot leave a truncated state file", () => {
    // writeFileSync truncates first and then writes. A crash in between leaves a
    // short file, and the next start reads it as the whole ledger. Writing to a
    // temporary name and renaming makes the swap atomic.
    const statePath = tempStatePath();
    const first = new CedulonSession({ statePath });
    assert.equal(spendOnce(first, "n0".padEnd(16, "-")).ok, true);
    assert.equal(spendOnce(first, "n1".padEnd(16, "-")).ok, true);
    const full = readFileSync(statePath, "utf8");

    // Nothing is left behind for the next writer to trip over.
    assert.deepEqual(
      readdirSync(join(statePath, "..")).filter((f) => f !== "state.json"),
      [],
      "no temporary file survives a completed save",
    );

    // A file left truncated by an older, non-atomic writer is refused rather
    // than read as an empty ledger.
    writeFileSync(statePath, full.slice(0, Math.floor(full.length / 2)));
    assert.throws(() => new CedulonSession({ statePath }), /state/i);
  });

  it("42 RED then GREEN: a temp directory reached through a symlink is not an attacker path", (t) => {
    // macOS /var → /private/var, and a TMPDIR that is itself a link, put every
    // mkdtemp path behind a symlink the operator did not place. Walking every
    // ancestor then throws cedulon-state-symlink and the suite falls over.
    // A leaf that is a symlink is still refused (case 70). A directory the
    // caller linked themselves is still refused (case 76).
    const real = mkdtempSync(join(tmpdir(), "cedulon-real-"));
    const link = `${real}-link`;
    try {
      symlinkSync(real, link, "dir");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        t.skip("directory symlinks unavailable on this host");
        return;
      }
      throw err;
    }
    const prev = process.env.TMPDIR;
    process.env.TMPDIR = link;
    try {
      const statePath = join(mkdtempSync(join(tmpdir(), "cedulon-state-")), "nested", "state.json");
      const session = new CedulonSession({ statePath });
      assert.equal(spendOnce(session, "n0".padEnd(16, "-")).ok, true);
    } finally {
      if (prev === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = prev;
      rmSync(link, { recursive: true, force: true });
      rmSync(real, { recursive: true, force: true });
    }
  });
});
