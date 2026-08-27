# Status

`npm run test:all` is green; `npx tsc --noEmit` is silent; `npm run audit`
exits 0 and the four bypass demos fail as designed. `docs/RUN_AS_VERIFIER.md`
carries the exact output of each demo, and part of the suite checks that file
against what the commands actually print.

Those demos run on fixtures. `npm run demo:live` does not: it reads a real
Base Sepolia USDC window over an RPC endpoint and reconciles it against a
receipt chain. A 128-settlement window was read from the live chain and every
one of the 128 came back as `settlement-without-receipt`, at
`guarantee=conditional` — a chain read is not a signed extract from the rail
operator. That is the whole of what runs against a real rail today: reading.
Nothing here holds a wallet or signs a transaction.

The three -00 drafts and `-02` (rev 02) are posted on the IETF datatracker.
The repository is archived at `10.5281/zenodo.22099792`. The core packages
carry no runtime dependencies; `@cedulon/mcp-server` depends only on the
official MCP SDK.

Eight packages are published on npm, so the server runs without a clone:
`npx -y @cedulon/mcp-server`. Seven are at `0.2.0`; `@cedulon/mcp-server` is at
`0.2.4`. Those versions carry the requirements added in `-01`, including the
pinned-key comparison and the window checks; `0.1.0` predates them. The
requirements `-02` adds — the transparency witness, the withheld and
not-anchored conditions, and signed totals redaction — are in this repository
but not yet in any published package, so check a claim against the repository
rather than an installed version.

Every tool the server exposes carries a title and the hint that applies to it:
four read-only, and `cedulon_spend`, which appends a receipt and is therefore
neither destructive nor idempotent. All five declare `openWorldHint: false`,
which is a measurement rather than a claim: this package and the six it depends
on contain no HTTP client and no socket, and their only dependency outside the
project is the MCP SDK. A test reads those annotations off the wire, so a tool
added without them fails the suite instead of failing a review.

`@cedulon/base-extract` and `@cedulon/mcp-guard` are not published and are
marked `private`, so a workspace publish skips them rather than relying on
this sentence staying true. Both build to `dist` like the other packages;
they are packable and unpublished. `demo:live` imports `base-extract`.

`npm run mcpb` packs the released package into an `.mcpb` bundle for one-click
desktop install. The 0.2.4 bundle was built and unpacked, and the server inside
it answered `initialize`, reported `0.2.4`, and listed five tools with their
annotations intact. The builder installs the published version rather than the
working tree, so it refuses to build a version npm does not have; that is what
keeps the bundle honest about what a user receives.

The bundle's manifest declares its privacy policy at
<https://cedulon.com/privacy.html>, which is also linked from the README that
ships inside the package. A missing or incomplete privacy policy is an outright
rejection from the Anthropic connector directory, so a test checks the manifest
declaration, the HTTPS scheme, and the shipped README together. Nothing has been
submitted to that directory yet. Smithery takes an HTTPS endpoint or a bundle;
neither has been submitted there either.

The server is listed on Glama at `dogrucanemek-alt/cedulon`. License and
quality both grade A; the release is 0.2.3 and Install Server is active. The
`Dockerfile` here is the image that was built and whose server answered
`initialize`, listed five tools, and returned a signed receipt.

The server is listed in the MCP Registry as `io.github.dogrucanemek-alt/cedulon`,
where `0.2.3` is the current version (`isLatest`). `server.json` is the entry
it was published from. Earlier listings: `0.2.1` announced itself as `0.2.0`
over `initialize`, because the version was written out a second time in the
source; `0.2.2` replaced that. `tests/release-manifest.test.ts` and the version
check in `tests/mcp-server.test.ts` compare those declarations against each
other.

Round 1 of external review is folded in, and the normative points it produced
are written into `spec/draft-dogru-cedulon-01.md`, posted on the datatracker
as rev 01. See `docs/EXTERNAL_REVIEW.md` for the findings and what changed.

Round 2 produced `spec/draft-dogru-cedulon-02.md`, posted as rev 02. Two
readers showed that the checkpoint carried the T11 guarantee while nothing
registered it or read it back: the anchoring section profiled only the receipt,
no verification step consumed a transparency receipt, equivocation could not
fire against a chain its own rules make consecutive, and a window total had no
redaction rule. `MUST-T11-10` through `MUST-T11-14` close those, and
`MUST-T9-5` carries the window total into the privacy requirements.

To reproduce any of the above, see `docs/RUN_AS_VERIFIER.md`.
