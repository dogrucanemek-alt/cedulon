import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CedulonSession, type SpendArgs } from "../packages/mcp-server/src/session.ts";
import {
  foldJournal,
  MockExternalRail,
  type ExternalRail,
  type JournalEntry,
} from "../packages/mcp-server/src/journal.ts";

const NOW = 1_700_000_000_000;

function nonce(label: string): string {
  return label.padEnd(16, "-");
}

function statePath(): string {
  return join(mkdtempSync(join(tmpdir(), "cedulon-journal-")), "state.json");
}

function spendArgs(n: string, amount = "1"): SpendArgs {
  return { amount, currency: "USD", payee: "payee-1", nonce: n };
}

type SubmitOpts = { crashAfter?: "prepared" | "submitted" };

function submitExternal(
  session: CedulonSession,
  args: SpendArgs,
  rail: ExternalRail,
  nowMs = NOW,
  opts?: SubmitOpts,
) {
  const fn = (
    session as CedulonSession & {
      submitExternal?: (
        a: SpendArgs,
        r: ExternalRail,
        t?: number,
        o?: SubmitOpts,
      ) => { ok: true; receipt: { claims: { nonce: string; outcome: string } } } | { ok: false; reason: string };
    }
  ).submitExternal;
  assert.equal(typeof fn, "function", "submitExternal is not on the session");
  return fn.call(session, args, rail, nowMs, opts);
}

function journalOf(session: CedulonSession): JournalEntry[] {
  return [...((session as unknown as { journal?: JournalEntry[] }).journal ?? [])];
}

function phases(session: CedulonSession, n: string): string[] {
  return journalOf(session)
    .filter((e) => e.nonce === n)
    .map((e) => e.phase);
}

describe("journal fold is a pure function", () => {
  it("RED then GREEN: folding the same journal twice is deep-equal", () => {
    const entries: JournalEntry[] = [
      { nonce: nonce("a"), amount: "1", currency: "USD", payee: "payee-1", phase: "prepared", atMs: 1 },
      { nonce: nonce("a"), amount: "1", currency: "USD", payee: "payee-1", phase: "submitted", atMs: 2 },
      { nonce: nonce("b"), amount: "2", currency: "USD", payee: "payee-1", phase: "prepared", atMs: 3 },
      { nonce: nonce("a"), amount: "1", currency: "USD", payee: "payee-1", phase: "settled", atMs: 4 },
    ];
    const once = foldJournal(entries);
    assert.deepEqual(foldJournal(entries), once);
    assert.deepEqual(foldJournal([...entries]), once);
    assert.deepEqual(
      once.map((row) => [row.nonce, row.phase]),
      [
        [nonce("a"), "settled"],
        [nonce("b"), "prepared"],
      ],
    );
  });
});

describe("external submit order and crash recovery", () => {
  it("RED then GREEN: a crash between submitted and the rail leaves indeterminate; the nonce stays burned", () => {
    const path = statePath();
    const first = new CedulonSession({ statePath: path });
    const n = nonce("crash");
    const rail = new MockExternalRail("crash");
    assert.throws(() => submitExternal(first, spendArgs(n), rail, NOW), /cedulon-rail-crash/);

    const restarted = new CedulonSession({
      statePath: path,
      keys: first.keys,
      policy: first.engine.policy,
    });
    assert.deepEqual(phases(restarted, n), ["prepared", "submitted", "indeterminate"]);
    assert.equal(restarted.engine.store.usedNonces.has(n), true, "MUST-T12-4: authority is not returned");
    assert.equal(restarted.spend(spendArgs(n), NOW + 1).ok, false, "the nonce cannot be spent again");
    assert.equal(restarted.receipts.length, 0, "no receipt is cut for a journal-only indeterminate");
  });

  it("RED then GREEN: a crash after prepared, before submitted, recovers as failed and releases the reserve", () => {
    const path = statePath();
    const first = new CedulonSession({ statePath: path });
    const n = nonce("prep");
    assert.throws(
      () => submitExternal(first, spendArgs(n), new MockExternalRail("settled"), NOW, { crashAfter: "prepared" }),
      /cedulon-injected-crash/,
    );

    const restarted = new CedulonSession({
      statePath: path,
      keys: first.keys,
      policy: first.engine.policy,
    });
    assert.deepEqual(phases(restarted, n), ["prepared", "failed"]);
    assert.equal(restarted.engine.store.usedNonces.has(n), false, "the reserve was given back");
    assert.equal(restarted.spend(spendArgs(n), NOW + 1).ok, true, "the nonce can be spent after a pre-submit fail");
  });

  it("a crash before prepared leaves no journal and no reserve", () => {
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    const n = nonce("none");
    assert.deepEqual(journalOf(session), []);
    assert.equal(session.engine.store.usedNonces.has(n), false);
    assert.equal(session.spend(spendArgs(n), NOW).ok, true);
  });

  it("RED then GREEN: recovery is idempotent — a second open does not append again", () => {
    const path = statePath();
    const first = new CedulonSession({ statePath: path });
    const n = nonce("idem");
    assert.throws(() => submitExternal(first, spendArgs(n), new MockExternalRail("crash"), NOW), /cedulon-rail-crash/);

    const second = new CedulonSession({
      statePath: path,
      keys: first.keys,
      policy: first.engine.policy,
    });
    const afterFirst = journalOf(second);
    const third = new CedulonSession({
      statePath: path,
      keys: first.keys,
      policy: first.engine.policy,
    });
    assert.deepEqual(journalOf(third), afterFirst);
    assert.deepEqual(foldJournal(journalOf(third)), foldJournal(afterFirst));
  });

  it("a rail that answers failed releases the reserve and cuts no receipt", () => {
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    const n = nonce("fail");
    const out = submitExternal(session, spendArgs(n), new MockExternalRail("failed"), NOW);
    assert.equal(out.ok, false);
    assert.deepEqual(phases(session, n), ["prepared", "submitted", "failed"]);
    assert.equal(session.engine.store.usedNonces.has(n), false);
    assert.equal(session.receipts.length, 0);
    assert.equal(session.spend(spendArgs(n), NOW + 1).ok, true);
  });

  it("RED then GREEN: a generic rail throw on retry is state-io", () => {
    const path = statePath();
    const first = new CedulonSession({ statePath: path });
    const n = nonce("io");
    assert.throws(() => submitExternal(first, spendArgs(n), new MockExternalRail("crash"), NOW), /cedulon-rail-crash/);
    const session = new CedulonSession({
      statePath: path,
      keys: first.keys,
      policy: first.engine.policy,
    });
    const generic: ExternalRail = {
      idempotentSubmit: true,
      submit() {
        throw new Error("rail-unavailable");
      },
    };
    const out = session.retryIndeterminate(n, generic, NOW + 1);
    assert.equal(out.ok, false);
    assert.equal((out as { reason: string }).reason, "state-io");
  });

  it("RED then GREEN: a rail that throws leaves the payment indeterminate in this session, not stuck", () => {
    // A payment handed to a rail the issuer does not control, with no answer
    // back, is indeterminate (MUST-T12-4). The live session wrote `submitted`
    // and stopped there; only a restart folded it into `indeterminate`, so
    // retry and resolve answered not-indeterminate until the server restarted.
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    const n = nonce("throw");
    const throwing: ExternalRail = {
      idempotentSubmit: true,
      submit() {
        throw new Error("rail-unavailable");
      },
    };
    const first = submitExternal(session, spendArgs(n), throwing, NOW);
    assert.equal(first.ok, false);
    assert.equal((first as { reason: string }).reason, "state-io");
    assert.deepEqual(phases(session, n), ["prepared", "submitted", "indeterminate"]);
    const onDisk = (JSON.parse(readFileSync(path, "utf8")) as { journal: JournalEntry[] }).journal
      .filter((e) => e.nonce === n)
      .map((e) => e.phase);
    assert.equal(onDisk.at(-1), "indeterminate", "the indeterminate row was not written to the state file");

    // A retry that throws again writes `submitted` again, and must not stop there either.
    const again = session.retryIndeterminate(n, throwing, NOW + 1);
    assert.equal(again.ok, false);
    assert.equal(phases(session, n).at(-1), "indeterminate");

    // The payment can be finished in the same session.
    const settled = session.retryIndeterminate(
      n,
      new MockExternalRail("settled", { idempotentSubmit: true }),
      NOW + 2,
    );
    assert.equal(settled.ok, true, "the payment stayed stuck until a restart");
  });

  it("a rail that answers settled cuts a settled receipt on the existing wire", () => {
    const path = statePath();
    const session = new CedulonSession({ statePath: path });
    const n = nonce("ok");
    const out = submitExternal(session, spendArgs(n), new MockExternalRail("settled"), NOW);
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.receipt.claims.outcome, "settled");
      assert.equal(out.receipt.claims.nonce, n);
    }
    assert.deepEqual(phases(session, n), ["prepared", "submitted", "settled"]);
    assert.equal(session.receipts.length, 1);
    assert.equal(session.ledger.extract().length, 1);
  });
});

describe("a state file written before the journal still loads", () => {
  it("RED then GREEN: a fixture without a journal field spends as it did", () => {
    const path = statePath();
    const first = new CedulonSession({ statePath: path });
    const n0 = nonce("old0");
    assert.equal(first.spend(spendArgs(n0), NOW).ok, true);
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    delete raw.journal;
    writeFileSync(path, `${JSON.stringify(raw)}\n`);

    const restarted = new CedulonSession({
      statePath: path,
      keys: first.keys,
      policy: first.engine.policy,
    });
    assert.equal(restarted.receipts.length, 1);
    assert.equal(restarted.receipts[0]?.claims.nonce, n0);
    assert.deepEqual(journalOf(restarted), []);
    const n1 = nonce("old1");
    assert.equal(restarted.spend(spendArgs(n1), NOW + 1).ok, true);
    assert.equal(restarted.receipts.length, 2);
  });
});
