# Status

`npm run test:all` is 103 pass; `npx tsc --noEmit` is silent; `npm run audit`
exits 0 and the four bypass demos fail as designed.

The three -00 drafts are posted on the IETF datatracker and the repository is
archived at `10.5281/zenodo.22099792`. The core packages carry no runtime
dependencies; `@cedulon/mcp-server` depends only on the official MCP SDK.

Eight packages are published on npm at `0.2.0`, so the server runs without a
clone: `npx -y @cedulon/mcp-server`. That version carries the requirements
added in `-01`, including the pinned-key comparison and the window checks;
`0.1.0` predates them. `@cedulon/base-extract` and `@cedulon/mcp-guard` are not
published.

Round 1 of external review is folded in, and the normative points it produced
are written into `spec/draft-dogru-cedulon-01.md`, which is compiled and ready
to submit. See `docs/EXTERNAL_REVIEW.md` for the findings and what changed.

To reproduce any of the above, see `docs/RUN_AS_VERIFIER.md`.
