import { strict as assert } from "node:assert";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Interop koba is a .mjs; the mapping assertions below are the types.
// @ts-expect-error no declaration file for the offline adapter script
import { fromBridgeLine, fromMetaLine, runFixture, sha256Text } from "../interop/mizan-ig/ig-adapter.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "interop", "mizan-ig", "fixtures");

describe("mizan-ig offline adapter", () => {
  it("maps verdict, ref and hashes only in fromBridgeLine / fromMetaLine", () => {
    const policy = sha256Text("ig-dm-policy-v1\n");
    const allow = fromBridgeLine(
      {
        id: "x1",
        receivedAt: 1_700_003_600_000,
        from: "u",
        text: "hello",
        verdict: "reply",
        reason: "in-scope",
        replyText: "hi",
      },
      policy,
    );
    assert.equal(allow.decision, "allow");
    assert.equal(allow.ref, "x1");
    assert.equal(allow.requestHash, sha256Text("hello"));
    assert.equal(allow.effectHash, sha256Text("hi"));
    assert.equal(allow.policyHash, policy);
    assert.equal(allow.effectClass, "ig-dm-reply");

    const deny = fromBridgeLine(
      { id: "x2", receivedAt: 1, from: "u", text: "no", verdict: "silent", reason: "out" },
      policy,
    );
    assert.equal(deny.decision, "deny");
    assert.equal(deny.effectHash, null);
    assert.equal(deny.effectClass, "ig-dm-reply");

    const defer = fromBridgeLine(
      { id: "x3", receivedAt: 1, from: "u", text: "ask", verdict: "ask-boss", reason: "boss" },
      policy,
    );
    assert.equal(defer.decision, "defer");

    const row = fromMetaLine({ id: "x1", sentAt: 2, to: "u", text: "hi" });
    assert.equal(row.ref, "x1");
    assert.equal(row.effectHash, sha256Text("hi"));
    assert.equal(row.effectClass, "ig-dm-reply");
    assert.equal(row.actor, "u");
  });

  it("normal-day: 12 reply / 6 silent / 2 ask-boss, 12 sent → balanced", () => {
    const report = runFixture(join(fixtures, "normal-day"));
    assert.equal(report.ok, true, report.findings.map((f: { code: string }) => f.code).join(","));
    assert.equal(report.counts.receipts.submitted, 20);
    assert.equal(report.counts.receipts.settled, 12);
    assert.equal(report.counts.receipts.aborted, 8);
    assert.equal(report.counts.receipts.matched, 12);
    assert.equal(report.counts.settlements.rows, 12);
    assert.equal(report.counts.settlements.matched, 12);
    assert.equal(report.findings.length, 0);
  });

  it("replay-storm: 40 sent / 5 decisions → 35 effect-without-decision", () => {
    const report = runFixture(join(fixtures, "replay-storm"));
    const orphans = report.findings.filter((f: { code: string }) => f.code === "effect-without-decision");
    assert.equal(orphans.length, 35);
    assert.equal(report.counts.settlements.rows, 40);
    assert.equal(report.counts.settlements.matched, 5);
    assert.equal(report.counts.settlements.unmatched, 35);
    assert.equal(report.ok, false);
  });

  it("leaked-refusal: silent but sent → 1 effect-against-refusal", () => {
    const report = runFixture(join(fixtures, "leaked-refusal"));
    assert.equal(report.findings.filter((f: { code: string }) => f.code === "effect-against-refusal").length, 1);
    assert.equal(report.ok, false);
  });

  it("an allow line with no replyText is refused, not hashed as empty", () => {
    // sha256("") would be a silent default: a record claiming an effect
    // whose content nobody stated. The adapter refuses the line instead.
    assert.throws(
      () =>
        fromBridgeLine(
          { id: "x9", receivedAt: 1, from: "u", text: "hi", verdict: "reply", reason: "ok" },
          sha256Text("policy"),
        ),
      /allow-without-reply-text:x9/,
    );
  });

  it("wrong-text: decided body ≠ sent body → 1 effect-mismatch", () => {
    const report = runFixture(join(fixtures, "wrong-text"));
    assert.equal(report.findings.filter((f: { code: string }) => f.code === "effect-mismatch").length, 1);
    assert.equal(report.ok, false);
  });
});
