import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { audit } from "@cedulon/audit";
import { PolicyEngine } from "@cedulon/core";
import { coseDecodeRefusalHex, hexToBytes, verifyCoseSign1 } from "@cedulon/cose";
import { wrapToolsCall } from "@cedulon/mcp-guard";
import { gatedSettle, verifyRailExtract } from "@cedulon/x402-adapter";
import { generateReceiptKeys, signReceipt, signReceiptJson, verifyReceiptJson, type SpendReceiptClaims } from "@cedulon/receipts";
import { findCheckpointChainBreak, findEquivocation, signCheckpoint, verifyCheckpoint } from "@cedulon/checkpoint";
import { verifyDecisionToken } from "@cedulon/core";
import { signManifest } from "@cedulon/manifest";

// The package entry starts a stdio server on import; the session is the unit
// under test here.
import { CedulonSession } from "../packages/mcp-server/src/session.ts";

const CLAIMS: SpendReceiptClaims = {
  payer: "payer-1",
  payee: "payee-1",
  amount: "1",
  currency: "USD",
  policyHash: "aa",
  manifestHash: null,
  noManifest: true,
  x402PaymentRef: null,
  timestampMs: 1_700_000_000_000,
  nonce: "n1".padEnd(16, "0"),
  prevReceiptHash: null,
  outcome: "aborted",
};

describe("amount octets survive the MCP boundary", () => {
  // MUST-T8-2 compares amount and currency as exact octets, and the amount
  // grammar forbids the leading zero that would make two spellings of one
  // number. BigInt(...) at the boundary erased that: "01" became 1n, printed
  // back as "1", and a spelling the grammar forbids sailed through the gate.
  it("RED then GREEN: the session refuses an amount the grammar forbids", () => {
    const session = new CedulonSession({ statePath: null });
    for (const bad of ["01", "0x10", " 1", "1n", ""]) {
      const out = session.spend(
        { amount: bad, currency: "USD", payee: "payee-1", nonce: `n-${bad}`.padEnd(16, "-"), tool: "spend" },
        1,
      );
      assert.equal(out.ok, false, `amount ${JSON.stringify(bad)} must be refused`);
      assert.equal(
        (out as { ok: false; reason: string }).reason,
        "malformed-amount",
        `amount ${JSON.stringify(bad)} must be refused by name, not reinterpreted`,
      );
    }
    const good = session.spend(
      { amount: "1", currency: "USD", payee: "payee-1", nonce: "n-good".padEnd(16, "-"), tool: "spend" },
      1,
    );
    assert.equal(good.ok, true, "the grammar admits plain decimal strings");
  });

  it("RED then GREEN: the guard refuses an amount the grammar forbids", () => {
    const k = generateReceiptKeys();
    const guard = wrapToolsCall({
      engine: new PolicyEngine({ maxAmount: 5n, maxCumulative: 5n, maxPayments: 3, windowMs: 1000 }),
      keys: { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem },
      payer: "p",
      nowMs: 1,
    });
    const out = guard({
      name: "spend",
      arguments: { amount: "01", currency: "USD", payee: "q", nonce: "guard".padEnd(16, "-") },
    });
    assert.equal(out.isError, true);
    assert.equal(
      out.content[0].text.includes("malformed-amount"),
      true,
      `expected a named refusal, got: ${out.content[0].text}`,
    );
  });
});

describe("decoder refusals keep their names (MUST-T4-18, MUST-T4-19)", () => {
  // The decoder refuses an oversized input as cbor-too-large and a duplicate
  // map key as cbor-duplicate-key. verifyCoseSign1 caught both and returned
  // false, so by the time the refusal reached an operator it read "signature
  // failed" - a named refusal in the decoder, an anonymous one on the audit
  // surface.
  it("RED then GREEN: an oversized receipt reaches the audit report by name", () => {
    const k = generateReceiptKeys();
    const signed = signReceipt(CLAIMS, k.privateKeyPem, k.publicKeyPem);
    const oversized = { ...signed, coseHex: "00".repeat(70_000) };
    const report = audit({ receipts: [oversized], checkpoints: [] });
    const named = [...report.findings, ...(report.warnings ?? [])].find((f) =>
      f.detail.includes("cbor-too-large"),
    );
    assert.ok(
      named,
      `expected a finding naming cbor-too-large, got: ${report.findings.map((f) => f.detail).join(" | ")}`,
    );
  });

  it("RED then GREEN: a duplicate protected-header key is refused by name", () => {
    // COSE_Sign1 [protected: h'a20101 0102' ({1:1, 1:2}), {}, h'00', h'00'].
    const hex = "8445a201010102a041004100";
    const k = generateReceiptKeys();
    // Two answers, not one: verification says "no" without throwing, and the
    // name of the refusal is a separate question asked of the bytes. An earlier
    // shape had verification throw the name, which made every caller one
    // forgotten catch away from a crash.
    assert.equal(verifyCoseSign1(hexToBytes(hex), k.publicKeyPem), false);
    assert.equal(coseDecodeRefusalHex(hex), "cbor-duplicate-key");
  });
});

describe("named refusals do not crash the surfaces that carry them", () => {
  // The first repair taught verifyCoseSign1 to rethrow named refusals, and
  // every path that consumes attacker-supplied bytes has to catch them by
  // name or the refusal becomes an uncaught exception - the exact crash
  // MUST-T4-19 forbids, moved one level up.
  const k = generateReceiptKeys();
  const signed = () => signReceipt(CLAIMS, k.privateKeyPem, k.publicKeyPem);

  it("RED then GREEN: an oversized inclusion receipt is left out, not thrown", () => {
    const report = audit({
      receipts: [],
      checkpoints: [],
      witnessTrust: { publicKeyPem: k.publicKeyPem },
      inclusionReceipts: [
        {
          statementHash: "aa",
          index: 0,
          treeHead: "bb",
          issuerPublicKeyPem: k.publicKeyPem,
          coseHex: "00".repeat(70_000),
        } as never,
      ],
    });
    assert.ok(report, "the audit must return a report, not throw");
  });

  it("RED then GREEN: an oversized countersignature is refused by name", () => {
    const r = { ...signed(), counterCoseHex: "00".repeat(70_000), payeePublicKeyPem: k.publicKeyPem };
    const report = audit({ receipts: [r], checkpoints: [] });
    const named = [...report.findings, ...report.warnings].find(
      (f) => f.code === "countersign-bad" && f.detail.includes("cbor-too-large"),
    );
    assert.ok(
      named,
      `expected countersign-bad naming cbor-too-large, got: ${[...report.findings, ...report.warnings].map((f) => `${f.code}:${f.detail}`).join(" | ")}`,
    );
  });

  it("RED then GREEN: the verify tool answers false instead of throwing", () => {
    const session = new CedulonSession({ statePath: null });
    const r = signed();
    const out = session.verify({
      receipt: { ...r, coseHex: "00".repeat(70_000) },
    } as never);
    assert.equal(out.ok, false);
    assert.equal(out.receipt, false);
  });

  const OVERSIZED_MANIFEST = {
    body: {
      description: "d",
      amount: "1",
      currency: "USD",
      acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      cancelCondition: "none",
      expiresAtMs: 9_999_999_999_999,
      ap2MandateHash: null,
    },
    publicKeyPem: k.publicKeyPem,
    coseHex: "00".repeat(70_000),
  };

  it("RED then GREEN: the gate denies an oversized manifest by the refusal's name", () => {
    // With a manifest root pinned, the gate verifies the manifest bytes; a
    // gate that throws on them is not fail-closed for whoever called it.
    const result = gatedSettle(
      new PolicyEngine({ maxAmount: 5n, maxCumulative: 5n, maxPayments: 3, windowMs: 1000 }),
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "q",
          nonce: "gate-mani".padEnd(16, "-"),
          nowMs: 1,
          tool: "spend",
        },
        payer: "p",
        manifest: OVERSIZED_MANIFEST as never,
        manifestTrust: k.publicKeyPem,
        paymentHeader: "mock-signed",
      },
      { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem },
      1,
    );
    assert.equal(result.status, 402);
    assert.equal(
      (result as { status: 402; reason: string }).reason,
      "cbor-too-large",
      "the refusal keeps its name instead of throwing or reading as a bad signature",
    );
  });

  it("the guard refuses an unpinned manifest before ever decoding it", () => {
    // The guard supplies no manifest root, so MUST-T4-16 refuses the payment
    // at attribution, before the oversized bytes are decoded - fail closed
    // ahead of the bound. Documented here so a future guard that grows a
    // manifest pin remembers the decode path it would open.
    const guard = wrapToolsCall({
      engine: new PolicyEngine({ maxAmount: 5n, maxCumulative: 5n, maxPayments: 3, windowMs: 1000 }),
      keys: { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem },
      payer: "p",
      nowMs: 1,
    });
    const out = guard({
      name: "spend",
      arguments: {
        amount: "1",
        currency: "USD",
        payee: "q",
        nonce: "guard2".padEnd(16, "-"),
        manifest: OVERSIZED_MANIFEST,
      },
    });
    assert.equal(out.isError, true);
    assert.equal(
      out.content[0].text.includes("manifest-unauthenticated"),
      true,
      `expected the attribution refusal, got: ${out.content[0].text}`,
    );
  });
});

describe("no verify path throws, whoever forgets to ask why (MUST-T4-19)", () => {
  // Codex broke the previous repair here. Teaching verifyCoseSign1 to rethrow
  // made every caller responsible for a try/catch; four were wrapped, five were
  // not, and a 65KB checkpoint took a whole audit down. Verification now answers
  // false for bytes it cannot read - fail-closed without a catch - and the name
  // is asked of the bytes at the surfaces that report it.
  const k = generateReceiptKeys();
  const cp = () =>
    signCheckpoint(
      {
        epoch: 0,
        startMs: 0,
        endMs: 10,
        receiptCount: 0,
        chainHeadHash: null,
        totals: {},
        prevCheckpointHash: null,
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );

  for (const [label, hex] of [
    ["over the byte bound", "00".repeat(65_537)],
    ["under the byte bound but past the nesting bound", "aa".repeat(35_000)],
  ] as const) {
    it(`RED then GREEN: an oversized checkpoint ${label} is a finding, not a crash`, () => {
      const report = audit({ receipts: [], checkpoints: [{ ...cp(), coseHex: hex }] });
      const named = report.findings.find(
        (f) => f.code === "checkpoint-total-mismatch" && /cbor-too-(large|deep)/.test(f.detail),
      );
      assert.ok(
        named,
        `expected a named checkpoint refusal, got: ${report.findings.map((f) => `${f.code}:${f.detail}`).join(" | ")}`,
      );
    });
  }

  it("RED then GREEN: the bare checkpoint helpers answer instead of throwing", () => {
    const bad = { ...cp(), coseHex: "00".repeat(65_537) };
    assert.equal(verifyCheckpoint(bad), false);
    assert.doesNotThrow(() => findCheckpointChainBreak([bad]));
    assert.doesNotThrow(() => findEquivocation([bad]));
  });

  it("RED then GREEN: a decision token that cannot be read is denied, not thrown", () => {
    const token = { claims: { requestHash: "aa", policyHash: "bb", expiryMs: 9e12, nonce: "n", singleUseId: "s" }, publicKeyPem: k.publicKeyPem, coseHex: "00".repeat(65_537) };
    assert.equal(verifyDecisionToken(token as never, 1, k.publicKeyPem), false);
  });

  it("RED then GREEN: verify by coseHex answers false for bytes it cannot decode", () => {
    const session = new CedulonSession({ statePath: null });
    const out = session.verify({ coseHex: "00".repeat(65_537), publicKeyPem: k.publicKeyPem });
    assert.equal(out.ok, false);
    assert.equal(out.receipt, false);
  });
});

describe("the manifest signer holds the amount grammar signReceipt holds", () => {
  // signReceipt has refused "01" since -00; signManifest signed it. A manifest
  // is where the terms are stated, and MUST-T8-2 compares its amount as exact
  // octets, so terms spelled "01" are terms no honest spend can match.
  const k = generateReceiptKeys();
  const body = (amount: string) => ({
    description: "d",
    amount,
    currency: "USD",
    acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    cancelCondition: "none",
    expiresAtMs: 9_000_000_000_000,
    ap2MandateHash: null,
  });

  it("RED then GREEN: signManifest refuses a spelling the grammar forbids", () => {
    for (const bad of ["01", " 1", "0x10", "-1", ""]) {
      assert.throws(
        () => signManifest(body(bad), k.privateKeyPem, k.publicKeyPem),
        /amount grammar/,
        `signManifest must refuse ${JSON.stringify(bad)}`,
      );
    }
    assert.doesNotThrow(() => signManifest(body("0"), k.privateKeyPem, k.publicKeyPem));
    assert.doesNotThrow(() => signManifest(body("1"), k.privateKeyPem, k.publicKeyPem));
  });
});

describe("the JSON verifiers answer on input RFC 8785 cannot encode", () => {
  // The COSE class was closed first, and the RFC 8785 sibling was missed:
  // canonical() sat outside the try in verifyRailExtract and
  // verifyReceiptJson, so a body carrying a non-finite number threw through
  // audit(). `JSON.parse("1e309")` yields Infinity without a syntax error, so
  // an unsigned extract file is enough to reach it.
  const k = generateReceiptKeys();
  const INF = JSON.parse("1e309") as number;

  it("RED then GREEN: an extract carrying a non-finite number is unverified, not thrown", () => {
    const extract = {
      body: { accountId: "a", railId: "r", windowStartMs: INF, windowEndMs: 2, settlements: [] },
      signature: "AA",
      publicKeyPem: k.publicKeyPem,
    };
    assert.equal(verifyRailExtract(extract as never), false);
    const report = audit({ receipts: [], checkpoints: [], extract: extract as never });
    assert.ok(report, "the audit must return a report, not throw");
    assert.equal(report.guarantee, "conditional");
  });

  it("RED then GREEN: the refusal keeps its name in the audit report", () => {
    // Closing the crash was half the fix: the report still said "signature
    // failed" for a body the encoder refused, and an operator could not tell
    // a limit from a forgery - the same rule the COSE side keeps by asking
    // coseDecodeRefusal beside every false verdict.
    const extract = {
      body: { accountId: "a", railId: "r", windowStartMs: INF, windowEndMs: 2, settlements: [] },
      signature: "AA",
      publicKeyPem: k.publicKeyPem,
    };
    const unpinned = audit({ receipts: [], checkpoints: [], extract: extract as never });
    const warn = unpinned.warnings.find((f) => f.code === "unauthenticated-extract");
    assert.ok(warn, "the unauthenticated-extract warning must be present");
    assert.match(warn.detail, /non-finite number/);

    const pinned = audit({
      receipts: [],
      checkpoints: [],
      extract: extract as never,
      trust: { publicKeyPem: k.publicKeyPem },
    });
    const mismatch = pinned.findings.find((f) => f.code === "extract-key-mismatch");
    assert.ok(mismatch, "the pinned path must still fail closed");
    assert.match(mismatch.detail, /non-finite number/);
  });

  it("RED then GREEN: a JSON receipt carrying a non-finite number is unverified, not thrown", () => {
    const signed = signReceiptJson(
      {
        payer: "p",
        payee: "q",
        amount: "1",
        currency: "USD",
        policyHash: "aa",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        timestampMs: 1,
        nonce: "n".padEnd(16, "0"),
        prevReceiptHash: null,
        outcome: "aborted",
      },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const bad = { ...signed, claims: { ...signed.claims, timestampMs: INF } };
    assert.equal(verifyReceiptJson(bad as never), false);
    assert.ok(audit({ receipts: [bad as never], checkpoints: [] }), "the audit must return a report");
    const session = new CedulonSession({ statePath: null });
    assert.doesNotThrow(() => session.verify({ receipt: bad as never }));
  });

  it("the producer still refuses to sign what it cannot encode", () => {
    // The asymmetry is deliberate: a verifier reports, a producer refuses.
    assert.throws(
      () =>
        signReceiptJson(
          {
            payer: "p",
            payee: "q",
            amount: "1",
            currency: "USD",
            policyHash: "aa",
            manifestHash: null,
            noManifest: true,
            x402PaymentRef: null,
            timestampMs: INF,
            nonce: "n".padEnd(16, "0"),
            prevReceiptHash: null,
            outcome: "aborted",
          },
          k.privateKeyPem,
          k.publicKeyPem,
        ),
      /non-finite/,
    );
  });
});

describe("the suite runs every test file on disk", () => {
  // A new test file passes on its own and stays out of test:all until someone
  // remembers to add it by name. That happened today: boundary-refusals ran
  // green alone while the suite that counts never saw it, so four RED-then-
  // GREEN cases were absent from the number the release reads. This compares
  // the two lists rather than trusting the copy in package.json.
  it("RED then GREEN: test:all and test:pre-release list every tests/*.test.ts", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const onDisk = readdirSync(join(root, "tests"))
      .filter((f) => f.endsWith(".test.ts"))
      .sort();
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const script of ["test:all", "test:pre-release"]) {
      const listed = new Set(
        [...pkg.scripts[script]!.matchAll(/tests\/([\w.-]+\.test\.ts)/g)].map((m) => m[1]!),
      );
      const missing = onDisk.filter((f) => !listed.has(f));
      assert.deepEqual(
        missing,
        [],
        `${script} does not run: ${missing.join(", ")} - a file the suite never sees is a case the release never counted`,
      );
      const vanished = [...listed].filter((f) => !onDisk.includes(f)).sort();
      assert.deepEqual(vanished, [], `${script} names files that are gone: ${vanished.join(", ")}`);
    }
  });
});
