# Live Base Sepolia extract (runbook)

This is a read-only walkthrough. It is not executed in CI. The repository
tests never open a socket; they replay synthetic Transfer logs.

You need:

- A Base Sepolia address you control
- ETH for gas (faucet) and a small amount of USDC
- A JSON-RPC URL in `CEDULON_RPC_URL` (your provider). Do not put the URL
  or any key in the repository.

## 1. Faucet

1. Base Sepolia ETH: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
   or another public Base Sepolia faucet.
2. USDC: https://faucet.circle.com (select Base Sepolia).

Circle USDC on Base Sepolia is
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

## 2. Note a block window

After the USDC arrives, pick a `from` block before the faucet transfer and
a `to` block after it. A block explorer for Base Sepolia shows both.

Example placeholders (replace):

```text
ADDRESS=0xYourAddress
FROM=31000000
TO=31001000
```

## 3. Pull the extract

From the repository root:

```bash
export CEDULON_RPC_URL="https://your-rpc.example"
npm run extract -- --address "$ADDRESS" --from "$FROM" --to "$TO"
```

On Windows PowerShell:

```powershell
$env:CEDULON_RPC_URL = "https://your-rpc.example"
npm run extract -- --address 0xYourAddress --from 31000000 --to 31001000
```

Expected stdout: a `RailExtract` JSON object.

- `accountId` is your address, lowercase
- `railId` is `base-sepolia-usdc`
- `settlements[]` rows use `ref = txHash:logIndex`, `amount` in atomic
  USDC (6 decimals, integer string), `currency = USDC`,
  `timestampMs` from the block time

A faucet credit of 1 USDC appears as `"amount": "1000000"`.

## 4. Bypass = off-switch transfer

Cedulon receipts only exist for spends that went through the policy gate.
A transfer you make on the rail yourself has no receipt.

1. Send USDC from `$ADDRESS` to any other address on Base Sepolia. Do
   **not** call `cedulon_spend`.
2. Re-run the extract over a window that includes that transaction.
3. Feed the extract into the audit engine together with the local receipt
   chain (empty, or only earlier gated spends):

```bash
npm run mcp
```

Then ask the host to call `cedulon_audit` with that extract row in
`extraSettlements`.

Expected finding:

```text
settlement-without-receipt
```

That is the Phase 2 claim in miniature: an authenticated rail extract
turns an ungated transfer into a finding. Completeness is still
conditional until the extract itself is signed.

## 5. What this repository will not do

- It will not send a transaction.
- It will not embed an RPC URL or a private key.
- `npm run test:all` stays offline.
