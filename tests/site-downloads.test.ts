import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8");

// The front page shows a download count. A count written into the page by hand
// is true for one day; the earlier "1,205 downloads" tile was dated and would
// have gone stale with every test still green. The page carries a floor that
// stays true while the count grows, and site/downloads.js replaces it with the
// reading verax-ai.com publishes each day. Kept as functions of the text so the
// red fixtures below can hand them a drifted page.
// "Over 100,000 downloads" is the floor and stays true; any other number in that
// shape is a reading copied into the page.
const EXACT_COUNT = /(?<!Over )\b\d{1,3}(?:,\d{3})+\s+(?:npm\s+)?downloads\b/i;

function assertNoHandwrittenCount(page: string): void {
  const hit = page.match(EXACT_COUNT);
  assert.equal(hit, null, `site/index.html hand-writes a download count (${hit?.[0]}); it goes stale the next day`);
}

function assertFloorAndFeed(page: string, script: string): void {
  assert.match(page, /<div data-downloads><b>Over \d{1,3}(?:,\d{3})+ downloads<\/b>/, "the downloads tile no longer carries a floor");
  assert.match(page, /<script src="downloads\.js"/, "site/index.html no longer loads downloads.js");
  assert.match(script, /https:\/\/verax-ai\.com\/downloads\.json/, "downloads.js no longer reads the verax-ai.com feed");
}

describe("site download count", () => {
  it("the front page writes a floor, not a count, and reads the count from the verax-ai.com feed", () => {
    const page = read("site/index.html");
    assertNoHandwrittenCount(page);
    assertFloorAndFeed(page, read("site/downloads.js"));
  });

  it("RED: a hand-written count fails, and a tile with no floor fails", () => {
    const page = read("site/index.html");
    const stale = page.replace(/Over \d{1,3}(?:,\d{3})+ downloads/, "109,352 downloads");
    assert.notEqual(stale, page, "fixture did not write a count into the tile");
    assert.throws(() => assertNoHandwrittenCount(stale), /hand-writes a download count \(109,352 downloads\)/);
    const bare = page.replace(/<div data-downloads><b>[^<]*<\/b>/, "<div data-downloads><b>Downloads</b>");
    assert.notEqual(bare, page, "fixture did not remove the floor");
    assert.throws(() => assertFloorAndFeed(bare, read("site/downloads.js")), /no longer carries a floor/);
  });
});
