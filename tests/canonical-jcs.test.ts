import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { canonical, parseIJson } from "@cedulon/core";

const dir = join(dirname(fileURLToPath(import.meta.url)), "jcs-vectors");

/**
 * RFC 8785 (JCS) against this tree's canonical(). The function is
 * the signature payload for receipts and rail extracts; a silent
 * drift here invalidates every signed object. The official pairs
 * are from cyberphone/json-canonicalization testdata. canonical()
 * is not edited in this file.
 */
describe("canonical() against RFC 8785", () => {
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".in.json"))) {
    const id = name.replace(".in.json", "");
    it(`GREEN: official JCS pair ${id}`, () => {
      const input = JSON.parse(readFileSync(join(dir, name), "utf8"));
      const expected = readFileSync(join(dir, `${id}.out.txt`), "utf8").replace(/\r?\n$/, "");
      assert.equal(canonical(input), expected);
    });
  }

  it("GREEN: RFC 8785 §3.2.3 property names sort as UTF-16 code units", () => {
    const sample: Record<string, string> = {
      "\u20ac": "Euro Sign",
      "\r": "Carriage Return",
      "\ufb33": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "\ud83d\ude00": "Emoji: Grinning Face",
      "\u0080": "Control",
      "\u00f6": "Latin Small Letter O With Diaeresis",
    };
    assert.deepEqual(Object.keys(sample).sort(), [
      "\r",
      "1",
      "\u0080",
      "\u00f6",
      "\u20ac",
      "\ud83d\ude00",
      "\ufb33",
    ]);
    const encoded = canonical(sample);
    assert.ok(encoded.indexOf('"\\r"') < encoded.indexOf('"1"'));
    assert.ok(encoded.indexOf('"1"') < encoded.indexOf("Euro Sign"));
  });

  it("NaN and Infinity throw — RFC 8785 §3.2.2.3, not an extension", () => {
    assert.throws(() => canonical(NaN), /non-finite number/);
    assert.throws(() => canonical(Infinity), /non-finite number/);
    assert.throws(() => canonical(-Infinity), /non-finite number/);
  });

  it("extension: bigint is a JSON string of its decimal", () => {
    assert.equal(canonical(1n), '"1"');
    assert.equal(canonical({ n: 99n }), '{"n":"99"}');
  });

  it("a lone surrogate is refused; RFC 8785 §3.2.2.2 requires terminate", () => {
    // Decision: Tiago inbox 561 + RFC 8785 §3.2.2.2. Existing Appendix A
    // vectors and fixtures were measured to contain no lone surrogate
    // before this encoder changed.
    assert.throws(() => canonical("\uDEAD"), /lone-surrogate/);
  });
});

describe("parseIJson is the single text-to-object gate", () => {
  it("RED then GREEN: a repeated member name is refused as json-duplicate-key", () => {
    assert.throws(() => parseIJson('{"amount":"1","amount":"99"}'), /json-duplicate-key/);
  });

  it("clean text parses as JSON.parse would", () => {
    assert.deepEqual(parseIJson('{"amount":"1"}'), { amount: "1" });
  });
});
