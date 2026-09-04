// Offline IG / WhatsApp-bridge koba. Two JSONL files in, a decision-profile
// audit out. No network, no Meta, no Hetzner. Field names below are a
// proposal; the real bridge log was not measured in this tree, so only
// fromBridgeLine / fromMetaLine change when that log is read.
//
//   node interop/mizan-ig/ig-adapter.mjs interop/mizan-ig/fixtures/normal-day

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { audit, DECISION_PROFILE } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint, totalsFromDecisionRecords } from "@cedulon/checkpoint";
import { decisionRecordHash, signDecisionRecord } from "@cedulon/core";
import { signEffectExtract } from "@cedulon/effect-extract";

import { DECIDER_KEYS, EFFECT_KEYS } from "./test-keys.mjs";

const VERDICT = {
  reply: "allow",
  silent: "deny",
  "ask-boss": "defer",
};

const DECIDER_ID = "decider-1";
const CHANNEL_ID = "ig-dm";

/** Declared population. Fixture timestamps sit well inside both δ edges. */
export const WINDOW_START_MS = 1_700_000_000_000;
export const WINDOW_END_MS = WINDOW_START_MS + 86_400_000;

export function sha256Text(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function toMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return Number(value);
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  throw new Error("unreadable-timestamp");
}

/**
 * Bridge log line → DecisionRecordClaims.
 * `policyHash` is sha256 of the fixture `policy.txt`; the line does not carry it.
 */
export function fromBridgeLine(line, policyHash) {
  const decision = VERDICT[line.verdict];
  if (decision === undefined) {
    throw new Error(`unknown-verdict:${line.verdict}`);
  }
  const allow = decision === "allow";
  if (allow && typeof line.replyText !== "string") {
    // sha256("") would be a silent default: an effect whose content nobody
    // stated. The line is refused; the audit never sees a made-up hash.
    throw new Error(`allow-without-reply-text:${line.id}`);
  }
  return {
    decider: DECIDER_ID,
    subject: String(line.from),
    requestHash: sha256Text(line.text),
    policyHash,
    inputsHash: null,
    decision,
    reasonCode: String(line.reason),
    ref: String(line.id),
    effectHash: allow ? sha256Text(line.replyText) : null,
    timestampMs: toMs(line.receivedAt),
    nonce: String(line.id).padEnd(16, "-"),
    prevRecordHash: null,
  };
}

/** Meta / sent-log line → EffectRow. */
export function fromMetaLine(line) {
  return {
    ref: String(line.id),
    effectHash: sha256Text(line.text),
    effectClass: "ig-dm-reply",
    timestampMs: toMs(line.sentAt),
    ...(line.to !== undefined ? { actor: String(line.to) } : {}),
  };
}

function readJsonl(path) {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return raw
    .split(/\n/)
    .map((row) => row.replace(/\r$/, ""))
    .filter((row) => row.length > 0)
    .map((row) => JSON.parse(row));
}

function signChain(claimList) {
  const signed = [];
  let prev = null;
  for (const claims of claimList) {
    const record = signDecisionRecord(
      { ...claims, prevRecordHash: prev },
      DECIDER_KEYS.privateKeyPem,
      DECIDER_KEYS.publicKeyPem,
    );
    signed.push(record);
    prev = decisionRecordHash(record);
  }
  return signed;
}

export function runFixture(dir) {
  const policyHash = sha256Text(readFileSync(join(dir, "policy.txt"), "utf8"));
  const records = signChain(readJsonl(join(dir, "decisions.jsonl")).map((line) => fromBridgeLine(line, policyHash)));
  const rows = readJsonl(join(dir, "sent.jsonl")).map(fromMetaLine);
  const extract = signEffectExtract(
    {
      deciderId: DECIDER_ID,
      channelId: CHANNEL_ID,
      windowStartMs: WINDOW_START_MS,
      windowEndMs: WINDOW_END_MS,
      effects: rows,
    },
    EFFECT_KEYS.privateKeyPem,
    EFFECT_KEYS.publicKeyPem,
  );
  const checkpoints =
    records.length === 0
      ? []
      : [
          signCheckpoint(
            buildCheckpointClaims(
              1,
              records,
              WINDOW_START_MS,
              WINDOW_END_MS,
              null,
              totalsFromDecisionRecords,
              decisionRecordHash,
            ),
            DECIDER_KEYS.privateKeyPem,
            DECIDER_KEYS.publicKeyPem,
          ),
        ];
  return audit({
    receipts: records,
    checkpoints,
    extract,
    issuerTrust: { publicKeyPem: DECIDER_KEYS.publicKeyPem },
    trust: {
      publicKeyPem: EFFECT_KEYS.publicKeyPem,
      accountId: DECIDER_ID,
      railId: CHANNEL_ID,
      windowStartMs: WINDOW_START_MS,
      windowEndMs: WINDOW_END_MS,
    },
    profile: DECISION_PROFILE,
  });
}

function printReport(name, report) {
  const line = (n = 74) => "-".repeat(n);
  console.log("");
  console.log(`PART 3  fixture ${name}`);
  console.log(line());
  const r = report.counts.receipts;
  const s = report.counts.settlements;
  console.log("   summary : " + report.summary);
  console.log("   guarantee : " + report.guarantee);
  console.log(
    "   receipts : submitted=" +
      r.submitted +
      " attested=" +
      r.attested +
      " inScope=" +
      r.inScope +
      " aborted=" +
      r.aborted +
      " settled=" +
      r.settled +
      " matched=" +
      r.matched +
      " deferred=" +
      r.deferred +
      " carried=" +
      r.carried +
      " unmatched=" +
      r.unmatched +
      " repeated=" +
      r.repeated,
  );
  console.log(
    "   settlements : rows=" +
      s.rows +
      " matched=" +
      s.matched +
      " deferred=" +
      s.deferred +
      " unmatched=" +
      s.unmatched +
      " repeated=" +
      s.repeated,
  );
  console.log("   findings: " + (report.findings.map((f) => f.code).join(", ") || "(none)"));
  console.log("   warnings: " + (report.warnings.map((w) => w.code).join(", ") || "(none)"));
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node interop/mizan-ig/ig-adapter.mjs <fixture-dir>");
    process.exit(2);
  }
  const dir = resolve(target);
  printReport(dir, runFixture(dir));
}
