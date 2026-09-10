# cedulon

Launcher for the Cedulon MCP server.

```bash
npx cedulon
```

This package contains no logic. It resolves `cedulon-mcp` inside
[`@cedulon/mcp-server`](https://www.npmjs.com/package/@cedulon/mcp-server), runs it, and forwards
the exit code unchanged.

To register the server with an MCP client, the documented form is still:

```bash
claude mcp add cedulon -- npx -y @cedulon/mcp-server
```

Cedulon is an audit layer for agent-to-agent spend: a signed trade manifest before
the spend, a signed receipt after it, and a reconciliation against the payment
rail's own records. It is fail-closed, so a non-zero exit is a refusal, not a crash.

Documentation: <https://cedulon.com> · Source: <https://github.com/dogrucanemek-alt/cedulon>

Apache-2.0 licensed.
