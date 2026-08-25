window.CEDULON_BALANCED = {
  "scenario": "balanced",
  "ok": true,
  "banner": "BALANCED",
  "summary": "audit: balanced",
  "receipts": [
    {
      "payer": "payer-1",
      "payee": "payee-1",
      "amount": "1",
      "currency": "USD",
      "nonce": "ok-0",
      "ref": "x402-ok-0",
      "hash": "f6f338df07c90104bcf4925a332233ddc43dfee4c83c55eea185cb34213bb1b4",
      "prevHash": null
    },
    {
      "payer": "payer-1",
      "payee": "payee-1",
      "amount": "1",
      "currency": "USD",
      "nonce": "ok-1",
      "ref": "x402-ok-1",
      "hash": "bc6fe498f6d668052c275a10f0e1987f63067df2a681ba4ab5a68c842eab3e51",
      "prevHash": "f6f338df07c90104bcf4925a332233ddc43dfee4c83c55eea185cb34213bb1b4"
    }
  ],
  "gapAfter": null,
  "settlements": [
    {
      "ref": "x402-ok-0",
      "amount": "1",
      "currency": "USD",
      "timestampMs": 1700000000000
    },
    {
      "ref": "x402-ok-1",
      "amount": "1",
      "currency": "USD",
      "timestampMs": 1700000000001
    }
  ],
  "checkpoints": [
    {
      "epoch": 1,
      "startMs": 1700000000000,
      "endMs": 1700000000010,
      "receiptCount": 2,
      "totals": {
        "USD": "2"
      },
      "chainHead": "bc6fe498f6d668052c275a10f0e1987f63067df2a681ba4ab5a68c842eab3e51",
      "hash": "64756bbf52186dac531c4111afb7eddf20ae8b35dcc38c8ceeaa671fc547670e"
    }
  ],
  "findings": []
};
window.CEDULON_BYPASS = {
  "scenario": "bypass",
  "ok": false,
  "banner": "1 SETTLEMENT WITHOUT RECEIPT → FAIL",
  "summary": "audit: 1 settlement without receipt → FAIL",
  "receipts": [
    {
      "payer": "payer-1",
      "payee": "payee-1",
      "amount": "1",
      "currency": "USD",
      "nonce": "ok-0",
      "ref": "x402-ok-0",
      "hash": "f6f338df07c90104bcf4925a332233ddc43dfee4c83c55eea185cb34213bb1b4",
      "prevHash": null
    },
    {
      "payer": "payer-1",
      "payee": "payee-1",
      "amount": "1",
      "currency": "USD",
      "nonce": "ok-1",
      "ref": "x402-ok-1",
      "hash": "bc6fe498f6d668052c275a10f0e1987f63067df2a681ba4ab5a68c842eab3e51",
      "prevHash": "f6f338df07c90104bcf4925a332233ddc43dfee4c83c55eea185cb34213bb1b4"
    }
  ],
  "gapAfter": 1,
  "settlements": [
    {
      "ref": "x402-ok-0",
      "amount": "1",
      "currency": "USD",
      "timestampMs": 1700000000000
    },
    {
      "ref": "x402-ok-1",
      "amount": "1",
      "currency": "USD",
      "timestampMs": 1700000000001
    },
    {
      "ref": "bypass-hidden",
      "amount": "7",
      "currency": "USD",
      "timestampMs": 1700000000002
    }
  ],
  "checkpoints": [
    {
      "epoch": 1,
      "startMs": 1700000000000,
      "endMs": 1700000000010,
      "receiptCount": 2,
      "totals": {
        "USD": "2"
      },
      "chainHead": "bc6fe498f6d668052c275a10f0e1987f63067df2a681ba4ab5a68c842eab3e51",
      "hash": "64756bbf52186dac531c4111afb7eddf20ae8b35dcc38c8ceeaa671fc547670e"
    }
  ],
  "findings": [
    {
      "code": "settlement-without-receipt",
      "id": "bypass-hidden",
      "detail": "settlement bypass-hidden 7 USD has no spend receipt"
    }
  ]
};
