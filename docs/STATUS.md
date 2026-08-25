# Status

`npm run test:all` is 97 pass; `npx tsc --noEmit` is silent; `npm run audit`
exits 0 and the four bypass demos fail as designed.

The three -00 drafts are posted on the IETF datatracker and the repository is
archived at `10.5281/zenodo.22099792`. The core packages carry no runtime
dependencies; `@cedulon/mcp-server` depends only on the official MCP SDK.

Eight packages are published on npm at `0.1.0`, so the server runs without a
clone: `npx -y @cedulon/mcp-server`. `@cedulon/base-extract` and
`@cedulon/mcp-guard` are not published.

Round 1 of external review is folded in: see `docs/EXTERNAL_REVIEW.md` for the
findings, what changed, and the normative points queued for -01.

To reproduce any of the above, see `docs/RUN_AS_VERIFIER.md`.
