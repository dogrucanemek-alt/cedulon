# Cedulon in 5 minutes

You will attach the MCP server to Claude or Cursor and try one spend plus one
audit. No wallet. No network rail. No clone, unless you want to read the code.

## 1. Point your host at the server

```json
{
  "mcpServers": {
    "cedulon": {
      "command": "npx",
      "args": ["-y", "@cedulon/mcp-server"]
    }
  }
}
```

- Claude Desktop: add it to the MCP servers file, then restart Claude.
- Claude Code: `claude mcp add cedulon -- npx -y @cedulon/mcp-server`, or add
  the same block to `.mcp.json` by hand.
- Cursor: Settings → MCP → add the same command.

That is the whole install. The published package is compiled JavaScript, so
there is nothing to build and no experimental Node flag to pass.

If you would rather not have the host reach npm at all, `npm run mcpb` in a
clone builds `build/cedulon-<version>.mcpb`: a single file holding the server
and its dependencies, which a desktop host installs in one click and which
offers the policy caps as settings during install.

## 2. Optional: clone and prove the suite

Only if you want to check the claims rather than take them:

```bash
git clone https://github.com/dogrucanemek-alt/cedulon.git
cd cedulon
npm install
npx tsc --noEmit
npm run test:all
```

Typecheck prints nothing. Tests should all pass. Running the server from the
sources instead of npm is `npm run mcp`.

## 3. Ask the host to spend

Demo policy allows `payee-1` / `USD` up to amount `10`.

Ask:

> Call `cedulon_spend` with amount 1, currency USD, payee payee-1, nonce demo-nonce-0001, tool spend.

You should get a signed receipt JSON (`ok: true`, `coseHex` present).

Then:

> Call `cedulon_audit`.

You should see `audit: balanced`.

A second spend with amount `11` is denied (`reason: limit-amount`).

## 4. Optional: persist the ledger

```bash
set CEDULON_STATE_PATH=./cedulon-state.json
npm run mcp
```

Do not commit that file. It holds demo keys for local replay only.

More detail: `packages/mcp-server/README.md`.
