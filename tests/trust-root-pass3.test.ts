import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildCheckpointClaims,
  findCheckpointChainBreak,
  findEquivocation,
  signCheckpoint,
} from "@cedulon/checkpoint";
import { PolicyEngine } from "@cedulon/core";
import { generateManifestKeys, signManifest } from "@cedulon/manifest";
import { counterSign, generateReceiptKeys, receiptHash, signReceipt, type SignedReceipt } from "@cedulon/receipts";
import { gatedSettle } from "@cedulon/x402-adapter";

import { CedulonSession } from "../packages/mcp-server/src/session.ts";

const NOW = 1_700_000_000_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(keys: Keys, i: number, prev: string | null = null): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee-1",
      amount: "1",
      currency: "USD",
      policyHash: "policy-hash",
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: `ref-${i}`,
      timestampMs: NOW + i,
      nonce: `n${i}`.padEnd(16, "-"),
      prevReceiptHash: prev,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

describe("trust roots, third pass", () => {
  it("52 RED then GREEN: countersigning checks the receipt against the issuer key the payee holds", () => {
    // The payee is about to put their name on this receipt. Checking it against
    // the key it travels with asks whether it is internally consistent, which is
    // not the question a payee is answering when they countersign.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const forged = receiptFor(attacker, 0);

    assert.throws(
      () => counterSign(forged, payee.privateKeyPem, payee.publicKeyPem, honest.publicKeyPem),
      /countersign-unsigned-receipt/,
      "a receipt from a key the payee does not recognise is not theirs to endorse",
    );
    const good = receiptFor(honest, 0);
    assert.ok(counterSign(good, payee.privateKeyPem, payee.publicKeyPem, honest.publicKeyPem));
  });

  it("53 RED then GREEN: the checkpoint chain and equivocation helpers take the issuer key too", () => {
    // audit() now hands these only what the issuer pin attests, but they are
    // exported, and the next caller gets whatever the objects carry.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const receipts = [receiptFor(honest, 0)];
    const first = signCheckpoint(
      buildCheckpointClaims(1, receipts, NOW, NOW + 10, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const rival = signCheckpoint(
      { ...first.claims, endMs: first.claims.endMs + 1 },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );

    assert.equal(
      findEquivocation([first, rival], honest.publicKeyPem),
      null,
      "two issuers signing one epoch is not one issuer equivocating",
    );
    assert.ok(findEquivocation([first, rival]), "unpinned, it still reports what it is given");

    const chain = findCheckpointChainBreak([first, rival], honest.publicKeyPem);
    assert.ok(chain, "a link the pinned issuer did not sign breaks the chain it claims to extend");
  });

  it("54 RED then GREEN: a manifest is checked against the key the caller holds for it", () => {
    // gatedSettle took the manifest's word for who signed it, so a payer could
    // present a manifest they minted and the receipt would carry its hash as if
    // the named party had authorised the terms.
    const issuer = generateReceiptKeys();
    const merchant = generateManifestKeys();
    const attacker = generateManifestKeys();
    const engine = () =>
      new PolicyEngine({ maxAmount: 10n, maxCumulative: 10n, maxPayments: 3, windowMs: 1000 });
    const keys = { receiptPrivatePem: issuer.privateKeyPem, receiptPublicPem: issuer.publicKeyPem };
    const body = {
      description: "one unit of work",
      amount: "1",
      currency: "USD",
      acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      cancelCondition: "none",
      expiresAtMs: NOW + 60_000,
    };
    const forgedManifest = signManifest(body, attacker.privateKeyPem, attacker.publicKeyPem);

    const call = (manifestTrust?: string) =>
      gatedSettle(
        engine(),
        {
          req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-"), nowMs: NOW },
          payer: "p",
          paymentHeader: "mock",
          manifest: forgedManifest,
          manifestTrust,
        },
        keys,
        NOW,
      );

    // Unpinned used to settle: the manifest verified against the key it carried
    // and the receipt went out holding those terms. The payment path refuses it
    // now, because a settlement is not the place to discover the doubt.
    const unpinned = call();
    assert.equal(unpinned.status, 402);
    assert.equal(unpinned.reason, "manifest-unauthenticated");
    const pinned = call(merchant.publicKeyPem);
    assert.equal(pinned.status, 402);
    assert.equal(pinned.reason, "manifest-bad-sig");
  });

  it("55 GREEN on arrival: a spend of a non-positive amount is refused end to end", () => {
    // No red to see here: the gate calls evaluate first, so this was already
    // closed. Kept as the regression guard for a claim that was reasoned about
    // rather than measured until now.
    const issuer = generateReceiptKeys();
    const engine = new PolicyEngine({
      maxAmount: 10n,
      maxCumulative: 10n,
      maxPayments: 3,
      windowMs: 1000,
    });
    const result = gatedSettle(
      engine,
      {
        req: { amount: -5n, currency: "USD", payee: "payee-1", nonce: "neg".padEnd(16, "-"), nowMs: NOW },
        payer: "p",
        paymentHeader: "mock",
      },
      { receiptPrivatePem: issuer.privateKeyPem, receiptPublicPem: issuer.publicKeyPem },
      NOW,
    );
    assert.equal(result.status, 402);
    assert.equal(result.reason, "amount-not-positive");
  });

  it("56 RED then GREEN: the session says whether the file holding its key is protected", () => {
    // The mode call succeeds on Windows and protects nothing there. A server
    // that stores a private key has to say which of those two it did, rather
    // than leaving the operator to infer protection from the absence of an error.
    const inMemory = new CedulonSession({ statePath: null });
    assert.equal(inMemory.status().stateProtection, "in-memory");

    const statePath = join(mkdtempSync(join(tmpdir(), "cedulon-prot-")), "state.json");
    const onDisk = new CedulonSession({ statePath });
    // Nothing has been written yet, and "there is no file" is its own answer.
    assert.equal(onDisk.status().stateProtection, "absent");
    assert.equal(
      onDisk.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-") }, 1).ok,
      true,
    );
    assert.equal(
      onDisk.status().stateProtection,
      process.platform === "win32" ? "unprotected-on-this-platform" : "owner-only",
    );
  });
});
