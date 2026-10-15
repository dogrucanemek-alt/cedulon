import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
  it("40 RED then GREEN: the state file holding the private key is not world-readable", () => {
    // POSIX: the PEM is in the file and the mode is the whole protection.
    // Windows: the PEM is a CurrentUser DPAPI blob, measured, not a mode bit.
    const statePath = tempStatePath();
    const session = new CedulonSession({ statePath });
    assert.equal(spendOnce(session, "n0".padEnd(16, "-")).ok, true);

    const raw = readFileSync(statePath, "utf8");
    const saved = JSON.parse(raw);

    if (process.platform === "win32") {
      assert.equal(saved.keys.receiptPrivatePem, undefined, "the PEM is not on disk");
      assert.equal(typeof saved.keys.receiptPrivateDpapi, "string");
      assert.equal(raw.includes("-----BEGIN PRIVATE KEY-----"), false);
      assert.equal(session.stateProtection(), "encrypted-at-rest");
    } else {
      assert.ok(saved.keys.receiptPrivatePem.includes("PRIVATE KEY"), "the key really is in there");
      assert.equal(statSync(statePath).mode & 0o777, 0o600, "state file is owner-only");
      assert.equal(
        statSync(join(statePath, "..")).mode & 0o777,
        0o700,
        "the directory the server created is owner-only too",
      );
    }
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

  it("RED then GREEN: a state file that repeats a member name is json-duplicate-key", () => {
    const statePath = tempStatePath();
    const session = new CedulonSession({ statePath });
    assert.equal(spendOnce(session, "n0".padEnd(16, "-")).ok, true);
    const honest = readFileSync(statePath, "utf8");
    writeFileSync(statePath, honest.replace('"version":1', '"version":1,"version":1'));
    assert.throws(() => new CedulonSession({ statePath }), /json-duplicate-key/);
  });

  it("RED then GREEN: a lock file that repeats a member name is json-duplicate-key", () => {
    const statePath = tempStatePath();
    const session = new CedulonSession({ statePath });
    assert.equal(spendOnce(session, "n0".padEnd(16, "-")).ok, true);
    writeFileSync(`${statePath}.lock`, '{"pid":1,"pid":1}');
    assert.throws(() => spendOnce(session, "n1".padEnd(16, "-")), /json-duplicate-key/);
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

  it("RED then GREEN: a state file that exists but cannot be read is refused, not started over", (t) => {
    // Any read error was taken to mean "no state yet". A file that a virus
    // scanner holds open, or whose permissions changed, then started the
    // server with no receipts and a newly generated key, and the first save
    // renamed over the file: measured on Windows, three receipts and the
    // signing key gone. Only a file that is not there is a fresh start.
    const dir = mkdtempSync(join(tmpdir(), "cedulon-unreadable-"));
    assert.throws(() => new CedulonSession({ statePath: dir }), /cedulon-state-unreadable/);

    const statePath = join(dir, "state.json");
    const first = new CedulonSession({ statePath });
    assert.equal(spendOnce(first, "n0".padEnd(16, "-")).ok, true);
    const before = readFileSync(statePath, "utf8");

    const user = process.env.USERNAME ?? "";
    const deny = () =>
      process.platform === "win32"
        ? execFileSync("icacls", [statePath, "/deny", `${user}:(RD)`], { stdio: "ignore" })
        : chmodSync(statePath, 0o000);
    const allow = () =>
      process.platform === "win32"
        ? execFileSync("icacls", [statePath, "/remove:d", user], { stdio: "ignore" })
        : chmodSync(statePath, 0o600);
    deny();
    try {
      let readable = true;
      try {
        readFileSync(statePath);
      } catch {
        readable = false;
      }
      if (readable) {
        t.skip("this account can read a file whose read permission was removed (root)");
        return;
      }
      assert.throws(() => new CedulonSession({ statePath }), /cedulon-state-unreadable/);
      assert.throws(() => first.reload(), /cedulon-state-unreadable/);
    } finally {
      allow();
    }
    assert.equal(readFileSync(statePath, "utf8"), before, "the state file was rewritten while it could not be read");

    // reload() emptied the session before it read the file. A reload that
    // fails has to leave the session as it was, or the next payment, once the
    // file can be read again, saves an empty history over the real one.
    assert.equal(first.receipts.length, 1, "a failed reload dropped the session's receipts");
    assert.equal(spendOnce(first, "n1".padEnd(16, "-")).ok, true);
    const saved = JSON.parse(readFileSync(statePath, "utf8")) as { receipts: unknown[] };
    assert.equal(saved.receipts.length, 2, "the receipt from before the failed reload is gone from the file");
  });
});
