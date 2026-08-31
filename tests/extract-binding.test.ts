import { strict as assert } from "node:assert";
import { createPublicKey } from "node:crypto";
import { describe, it } from "node:test";

import { audit, formatAudit, toFindingObject } from "@cedulon/audit";
import { receiptHash } from "@cedulon/receipts";
import { PolicyEngine } from "@cedulon/core";
import { fixtureEd25519Pems } from "@cedulon/cose";
import {
  RailLedger,
  gatedSettleWithLedger,
  generateExtractKeys,
  signRailExtract,
  type AdapterKeys,
} from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type RailKeys = ReturnType<typeof generateExtractKeys>;

/**
 * An extract that covers a real period. `RailLedger.signedExtract` derives the
 * window from the rows it holds, so an empty ledger declares `[0, 0)`: an
 * extract that reports on nothing balances trivially. Tests that mean to show
 * a clean audit have to state a period, the same way a verifier does.
 */
function railExtract(
  rail: RailKeys,
  settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }> = [],
  overrides: Partial<{ accountId: string; railId: string; windowStartMs: number; windowEndMs: number }> = {},
) {
  return signRailExtract(
    {
      accountId: overrides.accountId ?? "mock-account",
      railId: overrides.railId ?? "mock-rail",
      windowStartMs: overrides.windowStartMs ?? NOW,
      windowEndMs: overrides.windowEndMs ?? WINDOW_END,
      settlements,
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

/**
 * A pin that states the scope under audit, not only who signed: the account and
 * rail the report is about, and the period it covers. `railExtract` defaults to
 * the same account and rail, so a test that means to show a clean audit states
 * all three axes, the same way a verifier does.
 */
function pin(rail: RailKeys, overrides: Record<string, unknown> = {}) {
  return {
    publicKeyPem: rail.publicKeyPem,
    accountId: "mock-account",
    railId: "mock-rail",
    windowStartMs: NOW,
    windowEndMs: WINDOW_END,
    ...overrides,
  };
}

function adapterKeys(): AdapterKeys {
  const signer = fixtureEd25519Pems();
  return { receiptPrivatePem: signer.privateKeyPem, receiptPublicPem: signer.publicKeyPem };
}

function engine(): PolicyEngine {
  return new PolicyEngine({
    maxAmount: 10n,
    maxCumulative: 30n,
    maxPayments: 3,
    windowMs: 3_600_000,
    allowedPayees: ["payee-1"],
    allowedCurrencies: ["USD"],
  });
}

describe("rail extract binding", () => {
  it("18 RED then GREEN: an off-book row inside a signed extract is reconciled, not skipped", () => {
    const rail = generateExtractKeys();
    const extract = signRailExtract(
      {
        accountId: "mock-account",
        railId: "mock-rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        clockSkewMs: 0,
        settlements: [{ ref: "off-book-1", amount: "7", currency: "USD", timestampMs: NOW }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );

    // RED before the fix: the caller could hand over an empty array and the
    // off-book row inside the extract was never examined.
    const red = audit({
      receipts: [],
      checkpoints: [],
      settlements: [],
      extract,
      trust: pin(rail),
    });
    assert.equal(red.ok, false);
    assert.equal(
      red.findings.some((f) => f.code === "settlement-without-receipt" && f.id === "off-book-1"),
      true,
    );
    assert.equal(
      red.findings.some((f) => f.code === "extract-settlement-mismatch"),
      true,
      "the empty caller array is itself reported",
    );

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: railExtract(rail),
      trust: pin(rail),
    });
    assert.equal(green.ok, true);
    assert.equal(green.guarantee, "unconditional");
  });

  it("19 RED then GREEN: an unpinned or attacker-signed extract cannot reach an unconditional guarantee", () => {
    const attacker = generateExtractKeys();
    const rail = generateExtractKeys();
    const forged = railExtract(attacker);

    const unpinned = audit({ receipts: [], checkpoints: [], extract: forged });
    assert.equal(unpinned.guarantee, "conditional", "a self-signed extract proves nothing on its own");
    assert.equal(unpinned.warnings.some((f) => f.code === "unauthenticated-extract"), true);

    const pinned = audit({
      receipts: [],
      checkpoints: [],
      extract: forged,
      trust: pin(rail),
    });
    assert.equal(pinned.ok, false);
    assert.equal(pinned.findings.some((f) => f.code === "extract-key-mismatch"), true);

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: railExtract(rail),
      trust: pin(rail),
    });
    assert.equal(green.ok, true);
    assert.equal(green.guarantee, "unconditional");
  });

  it("20 RED then GREEN: an extract outside the expected account, rail, or window fails closed", () => {
    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    const extract = ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem, "other-account", "other-rail");

    const red = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: { publicKeyPem: rail.publicKeyPem, accountId: "mock-account", railId: "mock-rail" },
    });
    assert.equal(red.ok, false);
    assert.equal(red.findings.filter((f) => f.code === "extract-scope-mismatch").length, 2);

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem),
      trust: { publicKeyPem: rail.publicKeyPem, accountId: "mock-account", railId: "mock-rail" },
    });
    assert.equal(green.ok, true);
  });

  it("21 RED then GREEN: a repeated ref names the amount that is unaccounted for", () => {
    const ledger = new RailLedger();
    const result = gatedSettleWithLedger(
      engine(),
      {
        req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "real".padEnd(16, "-"), nowMs: NOW, tool: "spend" },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      adapterKeys(),
      NOW,
      ledger,
      null,
    );
    const receipt = (result as any).receipt;
    const legitRef = receipt.claims.x402PaymentRef;
    ledger.record({ ref: legitRef, amount: "7", currency: "USD", timestampMs: NOW + 1 });

    const red = audit({ receipts: [receipt], checkpoints: [], settlements: ledger.extract() });
    assert.equal(red.ok, false);
    const gap = red.findings.find((f) => f.code === "settlement-without-receipt" && f.id === legitRef);
    assert.ok(gap, "the repeated ref no longer swallows the finding");
    assert.match(gap.detail, /7 USD unaccounted/);

    const clean = new RailLedger();
    const ok = gatedSettleWithLedger(
      engine(),
      {
        req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "solo".padEnd(16, "-"), nowMs: NOW, tool: "spend" },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      adapterKeys(),
      NOW,
      clean,
      null,
    );
    const green = audit({
      receipts: [(ok as any).receipt],
      checkpoints: [],
      settlements: clean.extract(),
    });
    assert.equal(green.findings.some((f) => f.code === "settlement-without-receipt"), false);
  });

  it("22 RED then GREEN: once a key is pinned, a signature that does not verify fails closed", () => {
    const rail = generateExtractKeys();
    const good = railExtract(rail);
    const tampered = { ...good, signature: "aa" };

    // RED before the fix: the pin was only compared on the branch where the
    // signature already verified, so the worse input took the softer path and
    // came back ok: true with a mere warning.
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract: tampered,
      trust: pin(rail),
    });
    assert.equal(red.ok, false, "a pinned verifier does not accept an unverifiable extract");
    assert.equal(red.findings.some((f) => f.code === "extract-key-mismatch"), true);

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: good,
      trust: pin(rail),
    });
    assert.equal(green.ok, true);
  });

  it("23 RED then GREEN: a doubted extract is never described as an unconditional guarantee", () => {
    const attacker = generateExtractKeys();
    const rail = generateExtractKeys();
    const forged = railExtract(attacker);

    // RED before the fix: guarantee was derived from warnings alone, so a report
    // could name extract-key-mismatch and still call itself unconditional.
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract: forged,
      trust: pin(rail),
    });
    assert.equal(red.findings.some((f) => f.code === "extract-key-mismatch"), true);
    assert.equal(red.guarantee, "conditional");

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: railExtract(rail),
      trust: pin(rail),
    });
    assert.equal(green.guarantee, "unconditional");
  });

  it("24 RED then GREEN: the operator-facing output carries the guarantee and its warnings", () => {
    // RED before the fix: formatAudit printed "audit: balanced / receipts / findings=0"
    // and nothing else, so a conditional pass was indistinguishable from a
    // pinned one in the only output an operator reads.
    const unpinned = audit({ receipts: [], checkpoints: [], settlements: [] });
    const red = formatAudit(unpinned, 0);
    assert.match(red, /guarantee=conditional/);
    assert.match(red, /warn\tunauthenticated-extract/);

    const rail = generateExtractKeys();
    const green = formatAudit(
      audit({
        receipts: [],
        checkpoints: [],
        extract: railExtract(rail),
        trust: pin(rail),
      }),
      0,
    );
    assert.match(green, /guarantee=unconditional/);
    assert.equal(/warn\t(?!counterparty-unbound)/.test(green), false);
  });

  it("26 RED then GREEN: the same rail key in another encoding still matches the pin", () => {
    const rail = generateExtractKeys();
    const extract = railExtract(rail);

    // A rail that publishes its key as bare base64 SPKI rather than PEM. Same
    // key, same bytes; only the envelope differs. Comparing PEM text called
    // this a mismatch, which fails closed against an honest rail.
    const bareBase64 = createPublicKey(rail.publicKeyPem)
      .export({ type: "spki", format: "der" })
      .toString("base64");

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: pin(rail, { publicKeyPem: bareBase64 }),
    });
    assert.equal(green.ok, true, "the same key in another encoding is the same key");
    assert.equal(green.guarantee, "unconditional");

    const other = generateExtractKeys();
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: pin(rail, { publicKeyPem: other.publicKeyPem }),
    });
    assert.equal(red.findings.some((f) => f.code === "extract-key-mismatch"), true);
  });

  it("27 RED then GREEN: a pin the audit cannot read is named, not silently a mismatch", () => {
    const rail = generateExtractKeys();
    const extract = railExtract(rail);

    // RED before the fix: an unreadable pin compared unequal and was reported
    // as extract-key-mismatch, so an operator could not tell a forged extract
    // from their own malformed configuration.
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: { publicKeyPem: "-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----" },
    });
    assert.equal(red.ok, false, "an unreadable pin fails closed");
    assert.equal(red.findings.some((f) => f.code === "trust-key-unreadable"), true);
    assert.equal(
      red.findings.some((f) => f.code === "extract-key-mismatch"),
      false,
      "and is not confused with a key that simply does not match",
    );
    // On this path nothing was authenticated: the signature is never compared
    // because there was no readable key to compare it against. Reporting an
    // unconditional guarantee here would invert the whole point.
    assert.equal(red.guarantee, "conditional");

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: pin(rail),
    });
    assert.equal(green.ok, true);
  });

  it("28 RED then GREEN: a settlement outside the extract's declared window is named", () => {
    const rail = generateExtractKeys();
    // The rail declares one window but carries a row from outside it. Nothing
    // checked that the rows and the declared window agree, so the extract
    // could cover a period it did not actually report on.
    const strayed = signRailExtract(
      {
        accountId: "acct-1",
        railId: "rail-1",
        windowStartMs: NOW,
        windowEndMs: NOW + 1_000,
        settlements: [
          { ref: "inside", amount: "1", currency: "USD", timestampMs: NOW + 10 },
          { ref: "strayed", amount: "9", currency: "USD", timestampMs: NOW + 5_000 },
        ],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );

    const red = audit({
      receipts: [],
      checkpoints: [],
      extract: strayed,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    const stray = red.findings.find((f) => f.code === "extract-scope-mismatch" && f.id === "strayed");
    assert.ok(stray, "the row outside the declared window is named by its ref");
    assert.match(stray.detail, /outside the declared window/);
    assert.equal(
      red.findings.some((f) => f.code === "extract-scope-mismatch" && f.id === "inside"),
      false,
      "the row inside the window is not flagged",
    );

    const clean = signRailExtract(
      {
        accountId: "acct-1",
        railId: "rail-1",
        windowStartMs: NOW,
        windowEndMs: NOW + 1_000,
        settlements: [{ ref: "inside", amount: "1", currency: "USD", timestampMs: NOW + 10 }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: clean,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(green.findings.some((f) => f.code === "extract-scope-mismatch"), false);
  });

  it("29 RED then GREEN: without a stated window the extract picks its own scope", () => {
    const rail = generateExtractKeys();
    // The rail declares a one-millisecond window and carries nothing. Key,
    // account and rail all match the pin, so every check that exists passes
    // and the report balances over a period that reports on nothing.
    const sliver = signRailExtract(
      {
        accountId: "acct-1",
        railId: "rail-1",
        windowStartMs: NOW,
        windowEndMs: NOW + 1,
        settlements: [],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );

    const unstated = audit({
      receipts: [],
      checkpoints: [],
      extract: sliver,
      trust: { publicKeyPem: rail.publicKeyPem, accountId: "acct-1", railId: "rail-1" },
    });
    assert.equal(unstated.ok, true, "nothing is wrong with the rows it carries");
    assert.equal(
      unstated.guarantee,
      "conditional",
      "but a verifier that did not state a period cannot call the result unconditional",
    );
    assert.equal(unstated.warnings.some((f) => f.code === "unstated-audit-window"), true);

    // Stating the period turns the same sliver into a scope finding.
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract: sliver,
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct-1",
        railId: "rail-1",
        windowStartMs: NOW,
        windowEndMs: NOW + 3_600_000,
      },
    });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "extract-scope-mismatch"), true);

    const covering = signRailExtract(
      {
        accountId: "acct-1",
        railId: "rail-1",
        windowStartMs: NOW,
        windowEndMs: NOW + 3_600_000,
        settlements: [],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: covering,
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct-1",
        railId: "rail-1",
        windowStartMs: NOW,
        windowEndMs: NOW + 3_600_000,
      },
    });
    assert.equal(green.ok, true);
    assert.equal(green.guarantee, "unconditional", "stated period, covering extract, pinned key");
  });

  it("30 RED then GREEN: a duplicated ref reports a currency that exists only on the receipt side", () => {
    const signer = fixtureEd25519Pems();
    const ledger = new RailLedger();
    const result = gatedSettleWithLedger(
      engine(),
      {
        req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "dup".padEnd(16, "-"), nowMs: NOW, tool: "spend" },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      { receiptPrivatePem: signer.privateKeyPem, receiptPublicPem: signer.publicKeyPem },
      NOW,
      ledger,
      null,
    );
    const receipt = (result as any).receipt;
    const ref = receipt.claims.x402PaymentRef;

    // The rail reports this ref twice, both rows in EUR, so the ref takes the
    // dedup path and USD exists on the receipt side alone.
    const settlements = [
      { ref, amount: "4", currency: "EUR", timestampMs: NOW },
      { ref, amount: "4", currency: "EUR", timestampMs: NOW + 1 },
    ];

    const report = audit({ receipts: [receipt], checkpoints: [], settlements });
    assert.equal(report.ok, false);
    // RED before the fix: only the settled side was walked, so USD produced no
    // finding at all and the report was silently incomplete about a receipt
    // with nothing settled behind it.
    assert.equal(
      report.findings.some((f) => f.code === "settlement-mismatch" && f.id === ref && /USD/.test(f.detail)),
      true,
      "the receipt-only currency is reported",
    );
    assert.equal(
      report.findings.some((f) => f.code === "settlement-without-receipt" && /EUR/.test(f.detail)),
      true,
      "and the settlement-only currency still is too",
    );
  });

  it("31 RED then GREEN: a receipt from outside the extract's window is out of scope, not a failure", () => {
    const rail = generateExtractKeys();
    const keys = adapterKeys();
    const ledger = new RailLedger();

    // Two honest spends a day apart. The extract covers the first hour only.
    const first = gatedSettleWithLedger(
      engine(),
      {
        req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "in".padEnd(16, "-"), nowMs: NOW, tool: "spend" },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      keys,
      NOW,
      ledger,
      null,
    );
    const later = NOW + 86_400_000;
    const second = gatedSettleWithLedger(
      engine(),
      {
        req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "out".padEnd(16, "-"), nowMs: later, tool: "spend" },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      keys,
      later,
      ledger,
      receiptHash((first as any).receipt),
    );

    const firstReceipt = (first as any).receipt;
    const secondReceipt = (second as any).receipt;
    const extract = railExtract(rail, [
      {
        ref: firstReceipt.claims.x402PaymentRef,
        amount: "1",
        currency: "USD",
        timestampMs: NOW,
      },
    ]);

    // RED before the fix: the second receipt was matched against an extract
    // that never claimed to cover its day, and the honest spend was reported
    // as receipt-without-settlement.
    const report = audit({
      receipts: [firstReceipt, secondReceipt],
      checkpoints: [],
      extract,
      trust: pin(rail),
    });
    assert.equal(
      report.findings.some((f) => f.code === "receipt-without-settlement"),
      false,
      "a receipt outside the declared window is not this extract's business",
    );

    // Inside the window the rule still bites: drop the row and the first
    // receipt has nothing behind it.
    const red = audit({
      receipts: [firstReceipt, secondReceipt],
      checkpoints: [],
      extract: railExtract(rail),
      trust: pin(rail),
    });
    assert.equal(
      red.findings.some(
        (f) => f.code === "receipt-without-settlement" && f.id === firstReceipt.claims.nonce,
      ),
      true,
    );
  });

  it("25 RED then GREEN: an amount the audit cannot read is a finding, not a crash", () => {
    const ledger = new RailLedger();
    ledger.record({ ref: "dup", amount: "1.5", currency: "USD", timestampMs: NOW });
    ledger.record({ ref: "dup", amount: "2", currency: "USD", timestampMs: NOW + 1 });

    // RED before the fix: BigInt("1.5") threw out of audit() and took the whole
    // report down over one unreadable row.
    const red = audit({ receipts: [], checkpoints: [], settlements: ledger.extract() });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "malformed-amount" && f.id === "dup"), true);

    const clean = new RailLedger();
    clean.record({ ref: "solo", amount: "2", currency: "USD", timestampMs: NOW });
    const green = audit({ receipts: [], checkpoints: [], settlements: clean.extract() });
    assert.equal(green.findings.some((f) => f.code === "malformed-amount"), false);
  });

  it("32 RED then GREEN: without a stated account and rail the extract picks which path it reports on", () => {
    const rail = generateExtractKeys();
    // An extract covers one account on one rail. An account that can settle on
    // a second rail therefore has a path this extract never reported on, and a
    // balanced result over the first one says nothing about it. Pinning the key
    // and stating the period does not close that axis: neither of them says
    // which account, or which rail, the audit was over.
    const oneRail = signRailExtract(
      {
        accountId: "acct-1",
        railId: "rail-a",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );

    const unstated = audit({
      receipts: [],
      checkpoints: [],
      extract: oneRail,
      trust: { publicKeyPem: rail.publicKeyPem, windowStartMs: NOW, windowEndMs: WINDOW_END },
    });
    assert.equal(unstated.ok, true, "nothing is wrong with the rows it carries");
    assert.equal(
      unstated.warnings.some((w) => w.code === "unstated-audit-scope"),
      true,
    );
    assert.equal(
      unstated.guarantee,
      "conditional",
      "a verifier that named no account and no rail cannot call the result unconditional",
    );

    // Naming both closes the axis, the same way stating a period closes the
    // window one.
    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: oneRail,
      trust: pin(rail, { accountId: "acct-1", railId: "rail-a" }),
    });
    assert.equal(green.warnings.some((w) => w.code === "unstated-audit-scope"), false);
    assert.equal(green.guarantee, "unconditional");
  });

  it("33 RED then GREEN: a balanced report names the settlement path it covered", () => {
    const rail = generateExtractKeys();
    const report = audit({
      receipts: [],
      checkpoints: [],
      extract: railExtract(rail),
      trust: pin(rail),
    });
    assert.equal(report.guarantee, "unconditional");

    // "audit: balanced" with an unconditional guarantee is the strongest line
    // this tool prints, and it is true of one account on one rail over one
    // period. An operator reading it as an account-wide statement is reading
    // something the report never measured, so the report says what it covered.
    const printed = formatAudit(report, 0);
    assert.ok(
      printed.includes("scope=mock-account/mock-rail"),
      `expected the covered account and rail in the output, got:\n${printed}`,
    );
    assert.ok(
      printed.includes(`[${NOW},${WINDOW_END})`),
      `expected the covered period in the output, got:\n${printed}`,
    );
  });

  it("34 RED then GREEN: the returned finding object carries the scope the printed report names", () => {
    const rail = generateExtractKeys();
    // A caller reading the JSON is making the same judgement as the operator
    // reading the text, off the same run. If only one of the two surfaces says
    // which path was covered, the other one is the misreading that survives.
    const covered = toFindingObject(
      audit({ receipts: [], checkpoints: [], extract: railExtract(rail), trust: pin(rail) }),
      0,
    );
    assert.deepEqual(covered.scope, {
      accountId: "mock-account",
      railId: "mock-rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
    });

    // No extract, no declared population, nothing to name.
    const noExtract = toFindingObject(audit({ receipts: [], checkpoints: [] }), 0);
    assert.equal(noExtract.scope, undefined);
  });
});
