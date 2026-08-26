import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { mcpbManifest } from "../scripts/mcpb-manifest.ts";

// A release states the same name and the same version in more than one file,
// and each file is self-consistent, so nothing fails when one of them is left
// behind. These compare the declarations against each other.
//
// The first of these has already happened: the MCP Registry rejects an entry
// whose npm package does not carry a matching `mcpName`, and the 0.2.0 tarball
// carried none.

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));

describe("release manifest", () => {
  const pkg = read("../packages/mcp-server/package.json");
  const server = read("../server.json");

  it("the package claims the registry name that claims it", () => {
    assert.equal(
      pkg.mcpName,
      server.name,
      "mcpName in package.json must equal name in server.json, or the registry refuses the entry",
    );
  });

  it("the registry entry points at the version that exists", () => {
    const npmPackage = server.packages.find(
      (p: { registryType: string; identifier: string }) =>
        p.registryType === "npm" && p.identifier === pkg.name,
    );
    assert.ok(npmPackage, `server.json lists no npm package for ${pkg.name}`);
    assert.equal(npmPackage.version, pkg.version);
    assert.equal(server.version, pkg.version);
  });

  // The connector directory rejects a local connector outright when the
  // privacy policy is missing or incomplete, and the policy has to be
  // reachable from three places at once: the manifest, the README that ships
  // inside the bundle, and an HTTPS page. Any one of them going missing is the
  // whole submission.
  it("declares a privacy policy the directory will accept", () => {
    const manifest = mcpbManifest() as { manifest_version: string; privacy_policies?: string[] };
    assert.ok(
      Number.parseFloat(manifest.manifest_version) >= 0.2,
      "privacy_policies needs manifest_version 0.2 or later",
    );
    const urls = manifest.privacy_policies;
    assert.ok(Array.isArray(urls) && urls.length > 0, "manifest declares no privacy_policies");
    for (const url of urls) {
      assert.ok(url.startsWith("https://"), `privacy policy URL is not HTTPS: ${url}`);
    }

    const shipped = readFileSync(new URL("../packages/mcp-server/README.md", import.meta.url), "utf8");
    assert.match(shipped, /^##\s+Privacy Policy$/m, "the shipped README has no Privacy Policy section");
    for (const url of urls) {
      assert.ok(shipped.includes(url), `the shipped README does not link ${url}`);
    }
  });
});
