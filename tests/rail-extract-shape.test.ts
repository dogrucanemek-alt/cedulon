import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  generateExtractKeys,
  RailLedger,
  railExtractEncodeRefusal,
  railExtractShapeRefusal,
  railExtractTextRefusal,
  signRailExtract,
  verifyRailExtract,
  type RailExtractBody,
} from "@cedulon/x402-adapter";

describe("rail extract text is I-JSON before it is JSON: duplicate member names are refused by name", () => {
  // RFC 8785 takes I-JSON as input and I-JSON objects carry no duplicate
  // names. JSON.parse keeps the last value; measured on the previous build,
  // a row carrying amount twice parsed without refusal and read as the second
  // value. Two verifiers with different parsers would disagree under one
  // signature, so the text is refused before it is parsed.
  const row = (extra: string) =>
    `{"settlements":[{"ref":"r1","amount":"1",${extra}"currency":"USD","timestampMs":1}]}`;

  it("a member name repeated inside one object is refused as json-duplicate-key", () => {
    assert.equal(railExtractTextRefusal(row('"amount":"99",')), "json-duplicate-key");
    assert.throws(() => RailLedger.fromJson(row('"amount":"99",')), /json-duplicate-key/);
  });

  it("the same name in sibling objects, or inside a string value, is not a duplicate", () => {
    assert.equal(railExtractTextRefusal(row("")), null);
    const twoRows =
      '{"settlements":[{"ref":"r1","amount":"1","currency":"USD","timestampMs":1},' +
      '{"ref":"r2","amount":"1","currency":"USD","timestampMs":2}]}';
    assert.equal(railExtractTextRefusal(twoRows), null);
    assert.equal(railExtractTextRefusal(row('"note":"{\\"amount\\": 1, \\"amount\\": 2}",')), null);
    assert.equal(RailLedger.fromJson(twoRows).length, 2);
  });

  it("names are compared after unescaping: \\u0061 and a are the same member", () => {
    assert.equal(railExtractTextRefusal('{"a":1,"\\u0061":2}'), "json-duplicate-key");
    assert.equal(railExtractTextRefusal('{"a":1,"b":{"a":2}}'), null);
    assert.equal(railExtractTextRefusal('{"a":[{"x":1},{"x":2}],"b":{"x":3,"x":4}}'), "json-duplicate-key");
  });
});

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
    // The other bound moves with a safe value so the window still ends after
    // it starts: this table measures the integer rule, and the order rule has
    // its own case below.
    apply: (base: RailExtractBody, value: number): unknown => ({
      ...base,
      windowStartMs: value,
      windowEndMs: Number.isSafeInteger(value) ? value + 1 : base.windowEndMs,
    }),
  },
  {
    field: "windowEndMs",
    refusal: "malformed-extract-windowEndMs",
    apply: (base: RailExtractBody, value: number): unknown => ({
      ...base,
      windowEndMs: value,
      windowStartMs: Number.isSafeInteger(value) ? value - 1 : base.windowStartMs,
    }),
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
    assert.equal(railExtractShapeRefusal({ ...body, windowStartMs: -2, windowEndMs: -1 }), null);
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

  it("a window that does not end after it starts is refused as malformed-extract-window, and cannot be signed", () => {
    // Measured on the previous build: a correctly signed extract with
    // windowStartMs 20 and windowEndMs 10 and no rows came back from the
    // audit as balanced under an unconditional guarantee. The window is
    // half-open, so an empty or inverted one declares no population, and a
    // body carrying one is refused by name at both ends.
    const inverted = { ...body, windowStartMs: body.windowEndMs, windowEndMs: body.windowStartMs };
    assert.equal(railExtractShapeRefusal(inverted), "malformed-extract-window");
    assert.equal(railExtractShapeRefusal({ ...body, windowEndMs: body.windowStartMs }), "malformed-extract-window");
    assert.equal(railExtractShapeRefusal({ ...body, windowEndMs: body.windowStartMs + 1 }), null);
    const k = generateExtractKeys();
    assert.throws(() => signRailExtract(inverted, k.privateKeyPem, k.publicKeyPem), /malformed-extract-window/);
    const honest = signRailExtract(body, k.privateKeyPem, k.publicKeyPem);
    assert.equal(verifyRailExtract({ ...honest, body: inverted }, k.publicKeyPem), false);
  });

  it("an extra non-finite member is still the JCS encode refusal, not the shape gate", () => {
    const extra = { ...body, publishedAt: Number.POSITIVE_INFINITY };
    assert.equal(railExtractShapeRefusal(extra), null);
    const keys = generateExtractKeys();
    const signed = signRailExtract(body, keys.privateKeyPem, keys.publicKeyPem);
    assert.equal(railExtractEncodeRefusal({ ...signed, body: extra as RailExtractBody }), "non-finite number");
  });
});
