import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  generateExtractKeys,
  railExtractEncodeRefusal,
  railExtractShapeRefusal,
  signRailExtract,
  verifyRailExtract,
  type RailExtractBody,
} from "@cedulon/x402-adapter";

const body: RailExtractBody = {
  accountId: "acct",
  railId: "rail",
  windowStartMs: 1,
  windowEndMs: 10,
  settlements: [{ ref: "r1", amount: "1", currency: "USD", timestampMs: 1 }],
};

describe("rail extract single normative shape", () => {
  it("RED then GREEN: renaming a core settlement member is a named refuse on sign and verify", () => {
    const keys = generateExtractKeys();
    const renamed = {
      ...body,
      settlements: [{ paymentRef: "r1", amount: "1", currency: "USD", timestampMs: 1 }],
    };
    assert.equal(railExtractShapeRefusal(renamed), "renamed-settlement-ref");
    assert.throws(() => signRailExtract(renamed as never, keys.privateKeyPem, keys.publicKeyPem), /renamed-settlement-ref/);
    const signed = signRailExtract(body, keys.privateKeyPem, keys.publicKeyPem);
    const verifyInput = { ...signed, body: renamed as never };
    assert.equal(verifyRailExtract(verifyInput), false);
    assert.equal(railExtractEncodeRefusal(verifyInput), "renamed-settlement-ref");
  });

  it("RED then GREEN: an extra member on the body or a row still signs and verifies", () => {
    const keys = generateExtractKeys();
    const extra = {
      ...body,
      publishedBy: "mock-rail",
      settlements: [{ ...body.settlements[0], memo: "ok" }],
    };
    assert.equal(railExtractShapeRefusal(extra), null);
    const signed = signRailExtract(extra as RailExtractBody, keys.privateKeyPem, keys.publicKeyPem);
    assert.equal(verifyRailExtract(signed, keys.publicKeyPem), true);
  });

  it("RED then GREEN: missing window or identity is a named refuse on both sides", () => {
    const keys = generateExtractKeys();
    const noWindow = { accountId: "acct", railId: "rail", settlements: body.settlements };
    assert.equal(railExtractShapeRefusal(noWindow), "missing-extract-windowStartMs");
    assert.throws(
      () => signRailExtract(noWindow as never, keys.privateKeyPem, keys.publicKeyPem),
      /missing-extract-windowStartMs/,
    );
    const signed = signRailExtract(body, keys.privateKeyPem, keys.publicKeyPem);
    assert.equal(verifyRailExtract({ ...signed, body: noWindow as never }), false);
    assert.equal(railExtractEncodeRefusal({ ...signed, body: noWindow as never }), "missing-extract-windowStartMs");

    const noAccount = { railId: "rail", windowStartMs: 1, windowEndMs: 10, settlements: body.settlements };
    assert.equal(railExtractShapeRefusal(noAccount), "missing-extract-accountId");
  });
});

const SAFE_INTEGER_FIELDS = [
  {
    field: "windowStartMs",
    refusal: "malformed-extract-windowStartMs",
    apply: (base: RailExtractBody, value: number): unknown => ({ ...base, windowStartMs: value }),
  },
  {
    field: "windowEndMs",
    refusal: "malformed-extract-windowEndMs",
    apply: (base: RailExtractBody, value: number): unknown => ({ ...base, windowEndMs: value }),
  },
  {
    field: "timestampMs",
    refusal: "malformed-settlement-timestampMs",
    apply: (base: RailExtractBody, value: number): unknown => ({
      ...base,
      settlements: [{ ...base.settlements[0], timestampMs: value }],
    }),
  },
  {
    field: "clockSkewMs",
    refusal: "malformed-extract-clockSkewMs",
    apply: (base: RailExtractBody, value: number): unknown => ({ ...base, clockSkewMs: value }),
  },
] as const;

const NOT_SAFE_INTEGERS: ReadonlyArray<readonly [string, number]> = [
  ["1.5", 1.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["1e309", 1e309],
  ["2**53", 2 ** 53],
];

const SAFE_INTEGERS: ReadonlyArray<readonly [string, number]> = [
  ["1700000000000", 1_700_000_000_000],
  ["0", 0],
];

describe("rail extract POSIX millisecond fields are safe integers", () => {
  for (const { field, refusal, apply } of SAFE_INTEGER_FIELDS) {
    for (const [label, value] of NOT_SAFE_INTEGERS) {
      it(`RED then GREEN: ${field}=${label} is ${refusal}`, () => {
        assert.equal(railExtractShapeRefusal(apply(body, value)), refusal);
      });
    }
    for (const [label, value] of SAFE_INTEGERS) {
      it(`${field}=${label} is in shape`, () => {
        assert.equal(railExtractShapeRefusal(apply(body, value)), null);
      });
    }
  }

  it("negative POSIX milliseconds stay accepted; a negative clockSkewMs is refused by name", () => {
    // Negative POSIX milliseconds are dates before 1970; the text says
    // "an integer" and the gate keeps them. A negative allowance is not a
    // magnitude: the text says clockSkewMs MUST NOT be negative, so the
    // gate refuses it by name. -0 is numerically 0 and stays accepted.
    assert.equal(railExtractShapeRefusal({ ...body, windowStartMs: -1 }), null);
    assert.equal(railExtractShapeRefusal({ ...body, windowEndMs: -1 }), null);
    assert.equal(
      railExtractShapeRefusal({
        ...body,
        settlements: [{ ...body.settlements[0], timestampMs: -1 }],
      }),
      null,
    );
    assert.equal(railExtractShapeRefusal({ ...body, clockSkewMs: -1 }), "malformed-extract-clockSkewMs");
    assert.equal(railExtractShapeRefusal({ ...body, clockSkewMs: -0 }), null);
    assert.equal(railExtractShapeRefusal({ ...body, clockSkewMs: 0 }), null);
  });

  it("an extra non-finite member is still the JCS encode refusal, not the shape gate", () => {
    const extra = { ...body, publishedAt: Number.POSITIVE_INFINITY };
    assert.equal(railExtractShapeRefusal(extra), null);
    const keys = generateExtractKeys();
    const signed = signRailExtract(body, keys.privateKeyPem, keys.publicKeyPem);
    assert.equal(railExtractEncodeRefusal({ ...signed, body: extra as RailExtractBody }), "non-finite number");
  });
});
