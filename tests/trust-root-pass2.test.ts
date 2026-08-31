import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  signCheckpoint,
} from "@cedulon/checkpoint";
import { PolicyEngine, issueDecisionToken, signDecisionToken } from "@cedulon/core";
import {
  counterSign,
  generateReceiptKeys,
  receiptHash,
  signReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(keys: Keys, ref: string, amount: string, i: number, prev: string | null = null): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee",
      amount,
      currency: "USD",
      policyHash: TEST_HASH,
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: ref,
      timestampMs: NOW + i,
      nonce: `n${i}`.padEnd(16, "-"),
      prevReceiptHash: prev,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function checkpointFor(keys: Keys, receipts: SignedReceipt[]) {
  return signCheckpoint(
    buildCheckpointClaims(1, receipts, NOW, WINDOW_END, null),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function railWith(
  rail: Keys,
  settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }>,
) {
  return signRailExtract(
    { accountId: "acct", railId: "rail", windowStartMs: NOW, windowEndMs: WINDOW_END, settlements },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function railPin(rail: Keys) {
  return {
    publicKeyPem: rail.publicKeyPem,
    accountId: "acct",
    railId: "rail",
    windowStartMs: NOW,
    windowEndMs: WINDOW_END,
  };
}

describe("issuer trust root, second pass", () => {
  it("45 RED then GREEN: a foreign receipt cannot make the honest checkpoint and chain look wrong", () => {
    // Setting the forged receipt aside for matching was only half the job. The
    // totals, the head and the chain still walked the whole submitted list, so
    // one receipt from a key nobody trusts wrote three findings against an
    // honest checkpoint. An audit that blames the honest side is a reason to
    // stop pinning, which is the outcome the pin exists to prevent.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const issuerTrust = { publicKeyPem: honest.publicKeyPem };

    const clean = audit({
      receipts: [good],
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
      issuerTrust,
    });
    assert.equal(clean.ok, true);

    const noise = receiptFor(attacker, "ref-noise", "99", 5);
    const noisy = audit({
      receipts: [good, noise],
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
      issuerTrust,
    });

    const codes = noisy.findings.map((f) => f.code);
    assert.ok(codes.includes("issuer-key-mismatch"), "the foreign receipt is named");
    const blamedCodes = ["checkpoint-total-mismatch", "checkpoint-head-mismatch", "receipt-chain-break"] as const;
    for (const blamed of blamedCodes) {
      assert.equal(
        codes.includes(blamed),
        false,
        `${blamed} blames the honest side for a receipt the verifier already rejected`,
      );
    }
  });

  it("46 RED then GREEN: an unpinned witness cannot frame the issuer for equivocation", () => {
    // An inclusion receipt checked against the key it carries is a log anyone
    // can invent. Warning about it while still letting its checkpoints into the
    // equivocation pool means the attacker mints a second body for an epoch,
    // anchors it in a log of their own, and the honest issuer is reported for
    // publishing two checkpoints of one epoch.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const cp = checkpointFor(honest, [good]);

    const forgedLog = new MemoryTransparencyService(attacker);
    const rival = signCheckpoint(
      { ...cp.claims, endMs: cp.claims.endMs + 1 },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );

    const framed = audit({
      receipts: [good],
      checkpoints: [cp],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      inclusionReceipts: [anchorCheckpoint(forgedLog, rival)],
    });
    assert.deepEqual(
      framed.findings.map((f) => f.code),
      [],
      "a log the verifier never named cannot produce findings",
    );
    const unattributed = framed.warnings.find((w) => w.code === "unauthenticated-witness");
    assert.ok(unattributed);
    // The warning is the report of what this branch did, and this branch
    // verifies nothing: the receipt is left out of the comparison. Saying a
    // check ran against the carried key describes a call that is not made,
    // which is the same overclaim the guarantee line exists to prevent.
    assert.doesNotMatch(
      unattributed.detail,
      /\bis checked\b/,
      `the unpinned witness branch runs no check; detail must not say one ran: ${unattributed.detail}`,
    );
    assert.match(unattributed.detail, /left out/);
    assert.equal(framed.guarantee, "conditional");
  });

  it("47 RED then GREEN: a pinned witness cannot smuggle a body signed by another issuer", () => {
    // The witness pin says which log spoke. It does not say who signed the
    // statement that log holds, so the body has to answer to the issuer pin too
    // before it joins the epoch pool.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const witness = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const cp = checkpointFor(honest, [good]);

    const log = new MemoryTransparencyService(witness);
    const rival = signCheckpoint(
      { ...cp.claims, endMs: cp.claims.endMs + 1 },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );
    const report = audit({
      receipts: [good],
      checkpoints: [cp],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: witness.publicKeyPem },
      inclusionReceipts: [anchorCheckpoint(log, cp), anchorCheckpoint(log, rival)],
    });
    assert.equal(
      report.findings.some((f) => f.code === "equivocation"),
      false,
      "a body the issuer never signed is not the issuer equivocating",
    );
  });

  it("48 RED then GREEN: an issuer that rotated its key can name both", () => {
    // A single pin turns an honest rotation into a wall of findings, and the
    // way out an operator reaches for is to stop pinning. The verifier states
    // the keys it accepts, which is more than one while a rotation straddles
    // the window under audit.
    const oldKey = generateReceiptKeys();
    const newKey = generateReceiptKeys();
    const rail = generateExtractKeys();
    const first = receiptFor(oldKey, "ref-old", "1", 0);
    const second = receiptFor(newKey, "ref-new", "1", 1, receiptHash(first));
    const extract = railWith(rail, [
      { ref: "ref-old", amount: "1", currency: "USD", timestampMs: NOW },
      { ref: "ref-new", amount: "1", currency: "USD", timestampMs: NOW + 1 },
    ]);
    const receipts = [first, second];

    const report = audit({
      receipts,
      checkpoints: [checkpointFor(newKey, receipts)],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: [oldKey.publicKeyPem, newKey.publicKeyPem] },
    });
    assert.deepEqual(report.findings.map((f) => f.code), []);
    assert.equal(report.guarantee, "unconditional");
  });

  it("49 RED then GREEN: a countersignature is payee approval only if the payee key was named", () => {
    // counterCoseHex and payeePublicKeyPem travel beside the issuer signature
    // without being covered by it, so anyone holding an honest receipt can
    // append a countersignature of their own and the audit reads it as the
    // payee having approved the payment.
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const base = {
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    };

    const forged = counterSign(good, attacker.privateKeyPem, attacker.publicKeyPem);
    const unnamed = audit({ ...base, receipts: [forged] });
    assert.ok(
      unnamed.warnings.some((w) => w.code === "unauthenticated-countersigner"),
      "an unchecked countersignature is reported as unchecked",
    );

    const named = audit({
      ...base,
      receipts: [forged],
      payeeTrust: { [good.claims.payee]: payee.publicKeyPem },
    });
    assert.ok(
      named.warnings.some((f) => f.code === "countersign-key-mismatch"),
      "a countersignature from a key that is not the payee's is named",
    );
    assert.equal(named.ok, true);

    const real = counterSign(good, payee.privateKeyPem, payee.publicKeyPem);
    const green = audit({
      ...base,
      receipts: [real],
      payeeTrust: { [good.claims.payee]: payee.publicKeyPem },
    });
    assert.deepEqual(green.findings.map((f) => f.code), []);
    assert.equal(green.warnings.some((w) => w.code === "unauthenticated-countersigner"), false);
  });

  it("50 RED then GREEN: the policy engine checks a decision token against its own issuer key", () => {
    // The engine holds the key it signs decisions with, and verified the token
    // against the key the token carried. An attacker who can present a token
    // presents one they signed themselves.
    const keys = generateReceiptKeys();
    const engine = new PolicyEngine(
      { maxAmount: 10n, maxCumulative: 10n, maxPayments: 3, windowMs: 1000 },
      undefined,
      { privateKeyPem: keys.privateKeyPem, publicKeyPem: keys.publicKeyPem, ttlMs: 10_000 },
    );
    const req = { amount: 1n, currency: "USD", payee: "q", nonce: "n0".padEnd(16, "-"), nowMs: 1 };
    const decision = engine.evaluate(req);
    if (!decision.allow || !decision.token) {
      throw new Error("expected a signed decision token");
    }

    const attacker = generateReceiptKeys();
    const forged = signDecisionToken(
      decision.token.claims,
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );
    assert.equal(
      engine.consumeDecisionToken(forged, req, 1).reason,
      "decision-bad-sig",
      "a token this engine did not issue is not this engine's decision",
    );
    assert.equal(engine.consumeDecisionToken(decision.token, req, 1).allow, true);
  });

  it("51 RED then GREEN: no path to consume a decision accepts a non-positive amount", () => {
    // evaluate refuses it; the two consume entry points did not, and a caller
    // can reach them directly with a token minted by issueDecisionToken.
    const keys = generateReceiptKeys();
    const engine = new PolicyEngine(
      { maxAmount: 10n, maxCumulative: 10n, maxPayments: 3, windowMs: 1000 },
      undefined,
      { privateKeyPem: keys.privateKeyPem, publicKeyPem: keys.publicKeyPem, ttlMs: 10_000 },
    );
    const req = { amount: -5n, currency: "USD", payee: "q", nonce: "neg".padEnd(16, "-"), nowMs: 1 };
    assert.equal(engine.evaluate(req).reason, "amount-not-positive");

    const token = issueDecisionToken(
      req,
      engine.policy,
      "dec-smuggle",
      1 + 10_000,
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
    assert.equal(engine.consumeDecisionToken(token, req, 1).reason, "amount-not-positive");
    assert.equal(
      engine.consumeDecision("dec-smuggle", token.claims.requestHash, req).reason,
      "amount-not-positive",
    );
  });
});
