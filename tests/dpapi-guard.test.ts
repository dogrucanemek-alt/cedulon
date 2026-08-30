import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CedulonSession } from "../packages/mcp-server/src/session.ts";
import { generateReceiptKeys, verifyReceipt } from "@cedulon/receipts";

function statePath(): string {
  return join(mkdtempSync(join(tmpdir(), "cedulon-dpapi-")), "state.json");
}

function spend(session: CedulonSession, n: string, t = 1) {
  return session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: n.padEnd(16, "-") }, t);
}

function writeBareState(path: string, keys: Record<string, string>): Buffer {
  const body = `${JSON.stringify({
    version: 1,
    nextDecision: 1,
    keys,
    receipts: [],
    settlements: [],
    checkpoints: [],
    usedNonces: [],
    consumedDecisions: [],
    counters: { windowStartMs: 0, allowedCount: 0, allowedSum: "0" },
  })}\n`;
  writeFileSync(path, body);
  return Buffer.from(body);
}

describe("DPAPI protects the private key field, not the file", () => {
  it("RED then GREEN: a Windows save stores a blob and no PEM; POSIX is unchanged", () => {
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    assert.equal(spend(session, "n0").ok, true);
    const raw = readFileSync(path, "utf8");
    const saved = JSON.parse(raw) as {
      keys: { receiptPrivatePem?: string; receiptPrivateDpapi?: string };
    };

    if (process.platform === "win32") {
      assert.equal(saved.keys.receiptPrivatePem, undefined, "the PEM field is gone from disk");
      assert.equal(typeof saved.keys.receiptPrivateDpapi, "string");
      assert.ok((saved.keys.receiptPrivateDpapi ?? "").length > 0);
      assert.equal(raw.includes("-----BEGIN PRIVATE KEY-----"), false);
      assert.equal(session.stateProtection(), "encrypted-at-rest");
    } else {
      assert.ok(saved.keys.receiptPrivatePem?.includes("PRIVATE KEY"));
      assert.equal(saved.keys.receiptPrivateDpapi, undefined);
      assert.equal(session.stateProtection(), "owner-only");
    }
  });

  it("RED then GREEN: a new session loads the blob and can sign", () => {
    const path = statePath();
    const first = new CedulonSession({ statePath: path });
    assert.equal(spend(first, "n0").ok, true);
    const restarted = new CedulonSession({
      statePath: path,
      keys: first.keys,
      policy: first.engine.policy,
    });
    const out = spend(restarted, "n1", 2);
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(verifyReceipt(out.receipt, restarted.keys.receiptPublicPem), true);
    }
    if (process.platform === "win32") {
      assert.equal(restarted.stateProtection(), "encrypted-at-rest");
    }
  });

  it("RED then GREEN: a bad blob is refused by name and the file is not replaced", () => {
    const path = statePath();
    const pub = generateReceiptKeys().publicKeyPem;
    const before = writeBareState(path, {
      receiptPublicPem: pub,
      receiptPrivateDpapi: "not-a-dpapi-blob",
    });
    assert.throws(() => new CedulonSession({ statePath: path }), /cedulon-state-key-unreadable/);
    assert.deepEqual(readFileSync(path), before, "a refused open must not mint a replacement key");
  });

  it("RED then GREEN: once a blob is on disk, a later save cannot write the PEM", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    assert.equal(spend(session, "n0").ok, true);
    const { setProtectForTests } = await import("../packages/mcp-server/src/dpapi.ts");
    setProtectForTests(() => {
      throw new Error("dpapi-broken-for-test");
    });
    try {
      assert.equal(spend(session, "n1", 2).ok, true);
      const raw = readFileSync(path, "utf8");
      const saved = JSON.parse(raw) as { keys: { receiptPrivatePem?: string; receiptPrivateDpapi?: string } };
      assert.equal(saved.keys.receiptPrivatePem, undefined);
      assert.ok(saved.keys.receiptPrivateDpapi);
      assert.equal(raw.includes("-----BEGIN PRIVATE KEY-----"), false);
    } finally {
      setProtectForTests(null);
    }
  });

  it("POSIX never spawns PowerShell", async () => {
    if (process.platform === "win32") {
      return;
    }
    const { dpapiSpawnCount, resetDpapiSpawnCount } = await import("../packages/mcp-server/src/dpapi.ts");
    resetDpapiSpawnCount();
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    assert.equal(spend(session, "n0").ok, true);
    new CedulonSession({ statePath: path, keys: session.keys, policy: session.engine.policy });
    assert.equal(dpapiSpawnCount(), 0);
  });

  it("RED then GREEN: a clear PEM file still loads; Windows upgrades it on the first save", () => {
    const path = statePath();
    const keys = generateReceiptKeys();
    writeBareState(path, {
      receiptPublicPem: keys.publicKeyPem,
      receiptPrivatePem: keys.privateKeyPem,
    });
    const loaded = new CedulonSession({ statePath: path });
    assert.equal(loaded.keys.receiptPublicPem, keys.publicKeyPem);
    if (process.platform === "win32") {
      assert.equal(loaded.stateProtection(), "unprotected-on-this-platform", "upgrade has not been written yet");
      assert.equal(spend(loaded, "n0").ok, true);
      const raw = readFileSync(path, "utf8");
      const saved = JSON.parse(raw) as { keys: { receiptPrivatePem?: string; receiptPrivateDpapi?: string } };
      assert.equal(saved.keys.receiptPrivatePem, undefined);
      assert.ok(saved.keys.receiptPrivateDpapi);
      assert.equal(loaded.stateProtection(), "encrypted-at-rest");
    } else {
      assert.equal(spend(loaded, "n0").ok, true);
      const saved = JSON.parse(readFileSync(path, "utf8")) as { keys: { receiptPrivatePem?: string } };
      assert.ok(saved.keys.receiptPrivatePem?.includes("PRIVATE KEY"));
    }
  });
});
