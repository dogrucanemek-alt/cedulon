# Cedulon in 5 minutes

You will clone the repo, run the tests, attach the MCP server to Claude
or Cursor, and try one spend plus one audit. No wallet. No network rail.

## 1. Clone and install

```bash
git clone https://github.com/dogrucanemek-alt/cedulon.git
cd cedulon
npm install
```

## 2. Prove the suite

```bash
npx tsc --noEmit
npm run test:all
```

Typecheck prints nothing. Tests should all pass.

## 3. Point your host at the server

Use this `mcpServers` block. Set `cwd` to the clone path.

```json
{
  "mcpServers": {
    "cedulon": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "packages/mcp-server/src/index.ts"
      ],
      "cwd": "/absolute/path/to/cedulon"
    }
  }
}
```

- Claude Desktop: add it to the MCP servers file, then restart Claude.
- Claude Code: add the same block to `.mcp.json` or your user MCP config.
- Cursor: Settings → MCP → add the same command.

## 4. Ask the host to spend

Demo policy allows `payee-1` / `USD` up to amount `10`.

Ask:

> Call `cedulon_spend` with amount 1, currency USD, payee payee-1, nonce demo-nonce-0001, tool spend.

You should get a signed receipt JSON (`ok: true`, `coseHex` present).

Then:

> Call `cedulon_audit`.

You should see `audit: balanced`.

A second spend with amount `11` is denied (`reason: limit-amount`).

## 5. Optional: persist the ledger

```bash
set CEDULON_STATE_PATH=./cedulon-state.json
npm run mcp
```

Do not commit that file. It holds demo keys for local replay only.

More detail: `packages/mcp-server/README.md`.
