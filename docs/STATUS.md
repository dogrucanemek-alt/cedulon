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

The three -00 drafts are posted on the IETF datatracker and the repository is
archived at `10.5281/zenodo.22099792`. The core packages carry no runtime
dependencies; `@cedulon/mcp-server` depends only on the official MCP SDK.

Eight packages are published on npm, so the server runs without a clone:
`npx -y @cedulon/mcp-server`. Seven are at `0.2.0`; `@cedulon/mcp-server` is at
`0.2.3`. Those versions carry the requirements added in `-01`, including the
pinned-key comparison and the window checks; `0.1.0` predates them.

`@cedulon/base-extract` and `@cedulon/mcp-guard` are not published and are
marked `private`, so a workspace publish skips them rather than relying on
this sentence staying true. Neither is packaged for release: their entry
points name TypeScript sources, which works inside the repo and would not
work outside it. `demo:live` uses `base-extract` from the workspace.

`npm run mcpb` packs the released package into an `.mcpb` bundle for one-click
desktop install. The 0.2.3 bundle was built and unpacked, and the server inside
it answered `initialize`, listed exactly the tools its manifest declares, and
returned a signed receipt. It is not submitted to any directory: Glama requires
an account and a bot check, and Smithery takes an HTTPS endpoint or a bundle.

The server is listed in the MCP Registry as `io.github.dogrucanemek-alt/cedulon`,
where `0.2.2` is the current version. `server.json` is the entry it was published
from. Two versions are listed: `0.2.1` announced itself as `0.2.0` over
`initialize`, because the version was written out a second time in the source,
and `0.2.2` replaces it. `tests/release-manifest.test.ts` and the version check
in `tests/mcp-server.test.ts` now compare those declarations against each other.

Round 1 of external review is folded in, and the normative points it produced
are written into `spec/draft-dogru-cedulon-01.md`, which is compiled and ready
to submit. See `docs/EXTERNAL_REVIEW.md` for the findings and what changed.

To reproduce any of the above, see `docs/RUN_AS_VERIFIER.md`.
