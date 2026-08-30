import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import { PolicyEngine } from "@cedulon/core";
import { hexToBytes, verifyCoseSign1 } from "@cedulon/cose";
import { wrapToolsCall } from "@cedulon/mcp-guard";
import { generateReceiptKeys, signReceipt, type SpendReceiptClaims } from "@cedulon/receipts";

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
    const bytes = hexToBytes("8445a201010102a041004100");
    const k = generateReceiptKeys();
    assert.throws(() => verifyCoseSign1(bytes, k.publicKeyPem), /cbor-duplicate-key/);
  });
});
