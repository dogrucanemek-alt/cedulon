import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import { buildCheckpointClaims, checkpointHash, signCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash, signReceipt } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const P_START = 1_700_000_000_000;
const H = 3_600_000;
const N_START = P_START + H;
const N_END = N_START + H;

function claims(ref: string, ts: number, nonce: string, prev: string | null) {
  return {
    payer: "payer",
    payee: "payee-1",
    amount: "1",
    currency: "USD",
    policyHash: TEST_HASH,
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: ref,
    timestampMs: ts,
    nonce: nonce.padEnd(16, "-"),
    prevReceiptHash: prev,
    outcome: "settled" as const,
  };
}

function stream() {
  const issuer = generateReceiptKeys();
  const rail = generateExtractKeys();
  const r0 = signReceipt(
    claims("w-prev", P_START + 600_000, "a-prev", null),
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
  const cpPrev = signCheckpoint(
    buildCheckpointClaims(1, [r0], P_START, N_START, null),
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
  const r1 = signReceipt(
    claims("w-n", N_START + 600_000, "a-n", receiptHash(r0)),
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
  const cpN = signCheckpoint(
    buildCheckpointClaims(2, [r1], N_START, N_END, checkpointHash(cpPrev)),
    issuer.privateKeyPem,
    issuer.publicKeyPem,
  );
  const extract = signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: N_START,
      windowEndMs: N_END,
      settlements: [{ ref: "w-n", amount: "1", currency: "USD", timestampMs: N_START + 600_000 }],
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
  const trust = {
    publicKeyPem: rail.publicKeyPem,
    accountId: "acct",
    railId: "rail",
    windowStartMs: N_START,
    windowEndMs: N_END,
  };
  return { issuer, r0, r1, cpPrev, cpN, extract, trust };
}

function mismatchIds(report: ReturnType<typeof audit>): string[] {
  return report.findings
    .filter((f) => f.code === "checkpoint-total-mismatch" || f.code === "checkpoint-head-mismatch")
    .filter((f) => /-(count|head)$/.test(f.id) || /^epoch-\d+$/.test(f.id))
    .map((f) => `${f.code}:${f.id}`);
}

/**
 * Four pin states × (honest chain, refused checkpoint, epoch gap).
 * Coverage set drives attested count and settlement; diagnostic set drives
 * refusal naming and genesis/epoch/window continuity. Totals/count/head
 * compare only within one set, so an empty coverage set must not invent
 * mismatches against an honest diagnostic chain.
 *
 * One describe only: nested describes made Node's JUnit reporter emit a
 * parent suite whose tests attribute named the child suites, and the
 * impl-status gate that summed every suite attribute counted those cases
 * twice. Flat names keep the matrix readable without that hazard.
 */
describe("coverage set vs diagnostic set (pin matrix)", () => {
  it("usable pin / honest chain: attested covers settlement and raises no diagnostic noise", () => {
    const s = stream();
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [s.cpPrev, s.cpN],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: s.issuer.publicKeyPem },
    });
    assert.equal(report.counts.receipts.attested, 2);
    assert.equal(report.ok, true);
    assert.deepEqual(mismatchIds(report), []);
  });

  it("usable pin / refused checkpoint: named and outside the coverage set", () => {
    const s = stream();
    const refused = { ...s.cpPrev, coseHex: s.cpPrev.coseHex + "00" };
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [refused, s.cpN],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: s.issuer.publicKeyPem },
    });
    assert.ok(
      report.findings.some((f) => f.id === "epoch-1" && /refused:/.test(f.detail ?? "")),
      JSON.stringify(report.findings),
    );
    assert.equal(report.ok, false);
  });

  it("usable pin / epoch gap: window-coverage on the attested set", () => {
    const s = stream();
    const gap = signCheckpoint(
      buildCheckpointClaims(3, [s.r1], N_START, N_END, checkpointHash(s.cpPrev)),
      s.issuer.privateKeyPem,
      s.issuer.publicKeyPem,
    );
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [s.cpPrev, gap],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: s.issuer.publicKeyPem },
    });
    assert.ok(
      report.findings.some(
        (f) => f.code === "window-coverage" && f.id === "epoch-3" && /consecutive/.test(f.detail ?? ""),
      ),
      JSON.stringify(report.findings),
    );
    assert.equal(report.ok, false);
  });

  it("no pin / honest chain: presented-unattested covers conditionally and invents no mismatch", () => {
    const s = stream();
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [s.cpPrev, s.cpN],
      extract: s.extract,
      trust: s.trust,
    });
    assert.equal(report.counts.receipts.attested, 2);
    assert.equal(report.ok, true);
    assert.equal(report.guarantee, "conditional");
    assert.deepEqual(mismatchIds(report), []);
  });

  it("no pin / refused checkpoint: named and excluded from the working set", () => {
    const s = stream();
    const refused = { ...s.cpPrev, coseHex: s.cpPrev.coseHex + "00" };
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [refused, s.cpN],
      extract: s.extract,
      trust: s.trust,
    });
    assert.ok(
      report.findings.some((f) => f.id === "epoch-1" && /refused:/.test(f.detail ?? "")),
      JSON.stringify(report.findings),
    );
    assert.equal(report.ok, false);
  });

  it("no pin / epoch gap: window-coverage on the pinless working set", () => {
    const s = stream();
    const gap = signCheckpoint(
      buildCheckpointClaims(3, [s.r1], N_START, N_END, checkpointHash(s.cpPrev)),
      s.issuer.privateKeyPem,
      s.issuer.publicKeyPem,
    );
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [s.cpPrev, gap],
      extract: s.extract,
      trust: s.trust,
    });
    assert.ok(
      report.findings.some(
        (f) => f.code === "window-coverage" && f.id === "epoch-3" && /consecutive/.test(f.detail ?? ""),
      ),
      JSON.stringify(report.findings),
    );
    assert.equal(report.ok, false);
  });

  it("fully unreadable pin / RED then GREEN: honest chain keeps coverage empty without inventing total/count/head mismatches", () => {
    const s = stream();
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [s.cpPrev, s.cpN],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: "not a key" },
    } as Parameters<typeof audit>[0]);
    assert.equal(report.counts.receipts.attested, 0);
    assert.equal(report.findings.some((f) => f.code === "trust-key-unreadable"), true);
    assert.ok(
      report.findings.some((f) => f.code === "settlement-without-receipt"),
      JSON.stringify(report.findings),
    );
    assert.deepEqual(
      mismatchIds(report),
      [],
      `empty coverage must not invent mismatches against the diagnostic chain: ${JSON.stringify(report.findings)}`,
    );
    assert.equal(report.ok, false);
  });

  it("fully unreadable pin / refused checkpoint stays named; honest diagnostic survivors invent no coverage mismatch", () => {
    const s = stream();
    const refused = { ...s.cpPrev, coseHex: s.cpPrev.coseHex + "00" };
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [refused, s.cpN],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: "not a key" },
    } as Parameters<typeof audit>[0]);
    assert.ok(
      report.findings.some((f) => f.id === "epoch-1" && /refused: cbor-trailing/.test(f.detail ?? "")),
      JSON.stringify(report.findings),
    );
    assert.equal(report.counts.receipts.attested, 0);
    assert.equal(
      report.findings.some(
        (f) =>
          (f.code === "checkpoint-total-mismatch" || f.code === "checkpoint-head-mismatch") &&
          /^epoch-2/.test(f.id),
      ),
      false,
      JSON.stringify(report.findings),
    );
    assert.equal(report.ok, false);
  });

  it("fully unreadable pin / epoch gap stays visible on the diagnostic set without coverage-set total noise", () => {
    const s = stream();
    const gap = signCheckpoint(
      buildCheckpointClaims(3, [s.r1], N_START, N_END, checkpointHash(s.cpPrev)),
      s.issuer.privateKeyPem,
      s.issuer.publicKeyPem,
    );
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [s.cpPrev, gap],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: "not a key" },
    } as Parameters<typeof audit>[0]);
    assert.ok(
      report.findings.some(
        (f) => f.code === "window-coverage" && f.id === "epoch-3" && /consecutive/.test(f.detail ?? ""),
      ),
      JSON.stringify(report.findings),
    );
    assert.equal(report.counts.receipts.attested, 0);
    assert.deepEqual(mismatchIds(report), [], JSON.stringify(report.findings));
    assert.equal(report.ok, false);
  });

  it("partially readable pin / honest chain under a mixed pin: readable keys still attest; unreadable sibling fails the audit", () => {
    const s = stream();
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [s.cpPrev, s.cpN],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: [s.issuer.publicKeyPem, "not a key"] },
    });
    assert.equal(report.counts.receipts.attested, 2);
    assert.equal(report.findings.some((f) => f.code === "trust-key-unreadable"), true);
    assert.deepEqual(mismatchIds(report), []);
    assert.equal(report.ok, false);
  });

  it("partially readable pin / refused checkpoint under a mixed pin is still named", () => {
    const s = stream();
    const refused = { ...s.cpPrev, coseHex: s.cpPrev.coseHex + "00" };
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [refused, s.cpN],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: [s.issuer.publicKeyPem, "not a key"] },
    });
    assert.ok(
      report.findings.some((f) => f.id === "epoch-1" && /refused:/.test(f.detail ?? "")),
      JSON.stringify(report.findings),
    );
    assert.equal(report.findings.some((f) => f.code === "trust-key-unreadable"), true);
    assert.equal(report.ok, false);
  });

  it("partially readable pin / epoch gap under a mixed pin is still window-coverage", () => {
    const s = stream();
    const gap = signCheckpoint(
      buildCheckpointClaims(3, [s.r1], N_START, N_END, checkpointHash(s.cpPrev)),
      s.issuer.privateKeyPem,
      s.issuer.publicKeyPem,
    );
    const report = audit({
      receipts: [s.r0, s.r1],
      checkpoints: [s.cpPrev, gap],
      extract: s.extract,
      trust: s.trust,
      issuerTrust: { publicKeyPem: [s.issuer.publicKeyPem, "not a key"] },
    });
    assert.ok(
      report.findings.some(
        (f) => f.code === "window-coverage" && f.id === "epoch-3" && /consecutive/.test(f.detail ?? ""),
      ),
      JSON.stringify(report.findings),
    );
    assert.equal(report.findings.some((f) => f.code === "trust-key-unreadable"), true);
    assert.equal(report.ok, false);
  });
});
