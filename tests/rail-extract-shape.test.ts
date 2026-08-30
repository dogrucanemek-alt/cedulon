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
