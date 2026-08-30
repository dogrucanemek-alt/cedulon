import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CedulonSession, type SpendArgs } from "../packages/mcp-server/src/session.ts";
import {
  MockExternalRail,
  type ExternalRail,
  type JournalEntry,
} from "../packages/mcp-server/src/journal.ts";
import { generateExtractKeys, signRailExtract, type SignedRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;

function nonce(label: string): string {
  return label.padEnd(16, "-");
}

function statePath(): string {
  return join(mkdtempSync(join(tmpdir(), "cedulon-evidence-")), "state.json");
}

function spendArgs(n: string, amount = "1"): SpendArgs {
  return { amount, currency: "USD", payee: "payee-1", nonce: n };
}

function journalOf(session: CedulonSession): JournalEntry[] {
  return [...((session as unknown as { journal?: JournalEntry[] }).journal ?? [])];
}

function lastPhase(session: CedulonSession, n: string): string | undefined {
  const rows = journalOf(session).filter((e) => e.nonce === n);
  return rows[rows.length - 1]?.phase;
}

type ResolveEvidence = { extract: SignedRailExtract; railKeyPem: string };
type ResolveOut =
  | { ok: true; receipt: { claims: { nonce: string; outcome: string; timestampMs: number } } }
  | { ok: true; released: true }
  | { ok: false; reason: string };

function retryIndeterminate(session: CedulonSession, n: string, rail: ExternalRail, nowMs = NOW) {
  const fn = (
    session as CedulonSession & {
      retryIndeterminate?: (nonce: string, rail: ExternalRail, t?: number) => { ok: boolean; reason?: string };
    }
  ).retryIndeterminate;
  assert.equal(typeof fn, "function", "retryIndeterminate is not on the session");
  return fn.call(session, n, rail, nowMs);
}

function resolveIndeterminate(session: CedulonSession, n: string, evidence: ResolveEvidence, nowMs = NOW): ResolveOut {
  const fn = (
    session as CedulonSession & {
      resolveIndeterminate?: (nonce: string, evidence: ResolveEvidence, t?: number) => ResolveOut;
    }
  ).resolveIndeterminate;
  assert.equal(typeof fn, "function", "resolveIndeterminate is not on the session");
  return fn.call(session, n, evidence, nowMs);
}

function crashToIndeterminate(n: string, submittedAt = NOW) {
  const path = statePath();
  const first = new CedulonSession({ statePath: path });
  assert.throws(
    () => first.submitExternal(spendArgs(n), new MockExternalRail("crash"), submittedAt),
    /cedulon-rail-crash/,
  );
  const session = new CedulonSession({
    statePath: path,
    keys: first.keys,
    policy: first.engine.policy,
  });
  assert.equal(lastPhase(session, n), "indeterminate");
  return { session, path, keys: first.keys, policy: first.engine.policy };
}

function coveringExtract(
  n: string,
  rail: { privateKeyPem: string; publicKeyPem: string },
  settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }>,
  window: { start: number; end: number },
): SignedRailExtract {
  return signRailExtract(
    {
      accountId: "probe-account",
      railId: "probe-rail",
      windowStartMs: window.start,
      windowEndMs: window.end,
      settlements,
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

describe("K4 — retry is forbidden unless the rail declares idempotent submit", () => {
  it("RED then GREEN: a non-idempotent retry never reaches submit", () => {
    const n = nonce("k4no");
    const { session } = crashToIndeterminate(n);
    const rail = new MockExternalRail("settled");
    assert.equal(rail.idempotentSubmit, false);
    const out = retryIndeterminate(session, n, rail, NOW + 1);
    assert.equal(out.ok, false);
    assert.equal(out.reason, "rail-not-idempotent");
    assert.equal(rail.submitCalls, 0, "submit must not be called");
    assert.equal(rail.lastRow, null);
    assert.equal(lastPhase(session, n), "indeterminate");
  });

  it("RED then GREEN: retry on a settled nonce is not-indeterminate and does not call the rail", () => {
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    const n = nonce("k4set");
    assert.equal(session.submitExternal(spendArgs(n), new MockExternalRail("settled"), NOW).ok, true);
    const rail = new MockExternalRail("settled", { idempotentSubmit: true });
    const out = retryIndeterminate(session, n, rail, NOW + 1);
    assert.equal(out.ok, false);
    assert.equal(out.reason, "not-indeterminate");
    assert.equal(rail.submitCalls, 0);
  });
});

describe("K5 — extract evidence exits from indeterminate", () => {
  it("RED then GREEN: an unpinned extract is not evidence; the phase stays indeterminate", () => {
    const n = nonce("nopin");
    const { session } = crashToIndeterminate(n);
    const signedBy = generateExtractKeys();
    const held = generateExtractKeys();
    const extract = coveringExtract(n, signedBy, [], { start: NOW, end: NOW + 10 });
    const out = resolveIndeterminate(session, n, { extract, railKeyPem: held.publicKeyPem }, NOW + 1);
    assert.equal(out.ok, false);
    assert.equal(out.reason, "evidence-unverified");
    assert.equal(lastPhase(session, n), "indeterminate");
    assert.equal(session.engine.store.usedNonces.has(n), true);
  });

  it("RED then GREEN: a window that does not cover submitted atMs is window-not-covering (end exclusive)", () => {
    const n = nonce("win");
    const { session } = crashToIndeterminate(n, NOW);
    const rail = generateExtractKeys();
    // Half-open: NOW is not in [NOW - 10, NOW).
    const extract = coveringExtract(n, rail, [], { start: NOW - 10, end: NOW });
    const out = resolveIndeterminate(session, n, { extract, railKeyPem: rail.publicKeyPem }, NOW + 1);
    assert.equal(out.ok, false);
    assert.equal(out.reason, "window-not-covering");
    assert.equal(lastPhase(session, n), "indeterminate");

    // The left edge is in: [NOW, NOW + 1) covers submitted at NOW.
    const coveringEmpty = coveringExtract(n, rail, [], { start: NOW, end: NOW + 1 });
    const released = resolveIndeterminate(session, n, { extract: coveringEmpty, railKeyPem: rail.publicKeyPem }, NOW + 2);
    assert.equal(released.ok, true);
    assert.equal((released as { released?: true }).released, true);
  });

  it("RED then GREEN: a matching extract row cuts a late settled receipt; audit is clean", () => {
    const n = nonce("hit");
    const path = statePath();
    const first = new CedulonSession({ statePath: path });
    const earlier = nonce("early");
    assert.equal(first.spend(spendArgs(earlier), NOW + 5_000).ok, true);
    assert.throws(
      () => first.submitExternal(spendArgs(n), new MockExternalRail("crash"), NOW),
      /cedulon-rail-crash/,
    );
    const session = new CedulonSession({
      statePath: path,
      keys: first.keys,
      policy: first.engine.policy,
    });
    assert.equal(lastPhase(session, n), "indeterminate");

    const rail = generateExtractKeys();
    const extract = coveringExtract(
      n,
      rail,
      [{ ref: `x402-${n}`, amount: "1", currency: "USD", timestampMs: NOW }],
      { start: NOW, end: NOW + 1 },
    );
    const out = resolveIndeterminate(session, n, { extract, railKeyPem: rail.publicKeyPem }, NOW + 9_000);
    assert.equal(out.ok, true);
    if (!out.ok || !("receipt" in out)) throw new Error("expected a late receipt");
    assert.equal(out.receipt.claims.outcome, "settled");
    assert.equal(out.receipt.claims.nonce, n);
    assert.equal(out.receipt.claims.timestampMs, NOW, "the receipt takes the extract row's time");
    assert.equal(lastPhase(session, n), "settled");

    const cp = session.checkpoints[0];
    assert.ok(cp, "a checkpoint was rebuilt");
    assert.equal(cp.claims.startMs, NOW, "window start is min(receipt timestamps), not chain order");
    assert.ok(cp.claims.endMs > NOW + 5_000, "window end is past max(receipt timestamps)");

    const report = session.audit({ issuerTrust: { publicKeyPem: session.keys.receiptPublicPem } });
    assert.deepEqual(report.findings, [], report.findings.map((f) => `${f.code}: ${f.detail}`).join("\n"));
  });

  it("RED then GREEN: a covering extract with no row releases the nonce", () => {
    const n = nonce("miss");
    const { session } = crashToIndeterminate(n);
    const rail = generateExtractKeys();
    const extract = coveringExtract(n, rail, [], { start: NOW, end: NOW + 10 });
    const out = resolveIndeterminate(session, n, { extract, railKeyPem: rail.publicKeyPem }, NOW + 1);
    assert.equal(out.ok, true);
    assert.equal((out as { released?: true }).released, true);
    assert.equal(lastPhase(session, n), "failed");
    assert.equal(session.engine.store.usedNonces.has(n), false);
    assert.equal(session.receipts.length, 0);
    assert.equal(session.spend(spendArgs(n), NOW + 2).ok, true);
  });

  it("RED then GREEN: a row whose amount differs is evidence-mismatch; the phase stays", () => {
    const n = nonce("amt");
    const { session } = crashToIndeterminate(n);
    const rail = generateExtractKeys();
    const extract = coveringExtract(
      n,
      rail,
      [{ ref: `x402-${n}`, amount: "2", currency: "USD", timestampMs: NOW }],
      { start: NOW, end: NOW + 10 },
    );
    const out = resolveIndeterminate(session, n, { extract, railKeyPem: rail.publicKeyPem }, NOW + 1);
    assert.equal(out.ok, false);
    assert.equal(out.reason, "evidence-mismatch");
    assert.equal(lastPhase(session, n), "indeterminate");
    assert.equal(session.engine.store.usedNonces.has(n), true);
    assert.equal(session.receipts.length, 0);
  });
});
