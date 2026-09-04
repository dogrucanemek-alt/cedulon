import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  effectExtractShapeRefusal,
  generateEffectExtractKeys,
  signEffectExtract,
  verifyEffectExtract,
  type EffectExtractClaims,
  type EffectRow,
} from "@cedulon/effect-extract";

const H = createHash("sha256").update("cedulon/effect-extract-test").digest("hex");
const NOW = 1_700_000_000_000;
const END = NOW + 3_600_000;

function row(over: Partial<EffectRow> = {}): EffectRow {
  return {
    ref: "ref-1",
    effectHash: H,
    effectClass: "ig-dm-reply",
    timestampMs: NOW + 1_000,
    ...over,
  };
}

function body(over: Partial<EffectExtractClaims> = {}): EffectExtractClaims {
  return {
    deciderId: "decider-1",
    channelId: "ig-dm",
    windowStartMs: NOW,
    windowEndMs: END,
    effects: [row()],
    ...over,
  };
}

describe("effect extract: signed, shaped, windowed", () => {
  it("sign then verify; a foreign key is false", () => {
    const a = generateEffectExtractKeys();
    const b = generateEffectExtractKeys();
    const signed = signEffectExtract(body(), a.privateKeyPem, a.publicKeyPem);
    assert.equal(verifyEffectExtract(signed), true);
    assert.equal(verifyEffectExtract(signed, a.publicKeyPem), true);
    assert.equal(verifyEffectExtract(signed, b.publicKeyPem), false);
  });

  it("shape refusal: unknown field, reversed window, empty ref, bad hash, row outside window", () => {
    assert.equal(
      effectExtractShapeRefusal({ ...body(), extra: true }),
      "unknown-effect-field-extra",
    );
    assert.equal(
      effectExtractShapeRefusal(body({ windowStartMs: END, windowEndMs: NOW })),
      "malformed-extract-window",
    );
    assert.equal(effectExtractShapeRefusal(body({ effects: [row({ ref: "" })] })), "empty-effect-ref");
    assert.equal(
      effectExtractShapeRefusal(body({ effects: [row({ effectHash: "zz" })] })),
      "malformed-effect-hash",
    );
    assert.equal(
      effectExtractShapeRefusal(body({ effects: [row({ timestampMs: END })] })),
      "effect-outside-window",
    );
    assert.equal(effectExtractShapeRefusal(body()), null);
  });

  it("sign refuses the same names verify would refuse", () => {
    const k = generateEffectExtractKeys();
    assert.throws(
      () => signEffectExtract({ ...body(), extra: true } as EffectExtractClaims, k.privateKeyPem, k.publicKeyPem),
      /unknown-effect-field-extra/,
    );
    const signed = signEffectExtract(body(), k.privateKeyPem, k.publicKeyPem);
    assert.equal(verifyEffectExtract({ ...signed, body: { ...signed.body, extra: true } as never }), false);
  });
});
