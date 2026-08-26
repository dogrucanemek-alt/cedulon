# `@cedulon/mcp-guard`

Wraps an MCP `tools/call` so `spend` / `pay` go through the fail-closed
policy gate and the mock rail. Other tool names pass through.

```ts
import { wrapToolsCall } from "@cedulon/mcp-guard";

const call = wrapToolsCall({ engine, keys, payer, nowMs });
```

The package is marked `private` and is not published. This repository
builds it to `dist` so a packed install works outside the workspace.

Repository: https://github.com/dogrucanemek-alt/cedulon
