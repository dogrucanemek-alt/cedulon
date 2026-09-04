# mizan-ig — offline decision / effect koba

Two JSONL files become a Decision Record chain and an Effect Extract, then
`audit()` runs under `DECISION_PROFILE`. Nothing here talks to Meta, Hetzner,
or a live bridge.

```
npm run build:packages
node interop/mizan-ig/ig-adapter.mjs interop/mizan-ig/fixtures/normal-day
```

## Mapping (the only place field names live)

`fromBridgeLine(line, policyHash) → DecisionRecordClaims`

| line | claim |
|---|---|
| `verdict: "reply"` | `decision: "allow"` |
| `verdict: "silent"` | `decision: "deny"` |
| `verdict: "ask-boss"` | `decision: "defer"` |
| `id` | `ref` |
| `text` | `requestHash = sha256(text)` |
| `replyText` (allow) | `effectHash = sha256(replyText)`; a reply line without it is refused (`allow-without-reply-text`) |
| `receivedAt` | `timestampMs` |
| `from` | `subject` |
| `reason` | `reasonCode` |
| fixture `policy.txt` | `policyHash = sha256(file)` |

`fromMetaLine(line) → EffectRow`

| line | row |
|---|---|
| `id` | `ref` |
| `text` | `effectHash = sha256(text)` |
| `sentAt` | `timestampMs` |
| `to` | `actor` (optional) |
| — | `effectClass = "ig-dm-reply"` |

The real `/opt/whatsapp-bridge` log is not in this repository. When it is
measured, only these two functions should move. Candidates to measure on
the live box (Claude / patron, Hetzner):

- whether the inbound id is the same string as the outbound id
- the exact verdict vocabulary (`reply` / `silent` / `ask-boss` is a guess)
- whether `replyText` is the body that was actually handed to the sender
- timestamp field names and timezone
- whether a restart storm re-emits the same id or mints a new one

## Two keys

`test-keys.mjs`: A signs decision records, B signs the effect extract.
They are different. They protect nothing.

In production B is an independent process that watched the send path.
Meta does not sign a DM dump. Until that process exists and its key is
pinned out of band, `guarantee` stays `conditional`. That is the
guarantee axis doing its job, not a defect in the profile.

These fixtures pin the test B key so the lab report can name the
population. That pin is not a claim that Meta attested anything.

## Fixtures

| dir | shape | expected |
|---|---|---|
| `normal-day/` | 20 inbound (12 reply, 6 silent, 2 ask-boss), 12 sent | balanced |
| `replay-storm/` | 5 decisions, 40 sent | 35 `effect-without-decision` |
| `leaked-refusal/` | 1 silent, that id also sent | 1 `effect-against-refusal` |
| `wrong-text/` | 1 reply, sent body ≠ decided `replyText` | 1 `effect-mismatch` |
