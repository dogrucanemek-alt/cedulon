# `@cedulon/base-extract`

Read-only: Base Sepolia USDC `Transfer` logs as a Cedulon `RailExtract`.
No wallet, no key, no transaction.

```ts
import { fetchUsdcExtract, makeRpc } from "@cedulon/base-extract";

const extract = await fetchUsdcExtract({
  rpc: makeRpc(process.env.CEDULON_RPC_URL!),
  account: "0x...",
  fromBlock: 31_000_000,
  toBlock: 31_001_000,
});
```

The package is marked `private` and is not published. This repository
builds it to `dist` so a packed install works outside the workspace.

Repository: https://github.com/dogrucanemek-alt/cedulon
