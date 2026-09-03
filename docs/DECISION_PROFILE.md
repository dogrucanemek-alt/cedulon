# Decision profile (prepared, not published)

The tree now carries a second population on the same reconciler; unproven
until a reader outside this branch runs the conformance cases and the
offline IG koba against a log whose field names have been measured.

This is not a specification. Finding codes stay diagnostic
(`docs/FINDING_OBJECT.md`). The spend path is unchanged
(`tests/spend-golden.test.ts` compares `audit()` byte for byte).

## The triangle

The spend reconciler already closes three signed objects over a declared
population (account, rail, window). The decision profile uses the same
three roles:

| Role | Spend | Decision |
|---|---|---|
| Issuer record | `SpendReceiptClaims` | `DecisionRecordClaims` |
| Counterparty | `RailSettlement` | `EffectRow` |
| Match key | `ref` | `ref` |
| Content bind | amount + currency | allow ⇒ a row exists and `effectHash` is equal; deny/defer ⇒ no row |
| Record that expects no row | `outcome: aborted` | `decision: deny` or `defer` |
| Aggregate witness | checkpoint `totals` per currency | checkpoint `totals` `{allow,deny,defer}` |
| Population | account, rail, window | decider, channel, window |

`MatchCounts.aborted` counts deny+defer. The counter names stay in the
spend dialect; renaming them is a separate decision
(`packages/audit/src/profiles/decision.ts`).

## Profile interface

Copied from `packages/audit/src/profile.ts`. If this block and that file
disagree, the file is right.

```
export type ReconciliationProfile<Rec, Row> = {
  id: string;
  recordRef(record: Rec): string | null;
  expectsRow(record: Rec): boolean;
  rowKey(row: Row): string;
  bind(record: Rec, row: Row): BindResult;
  aggregate(ref: string, records: Rec[], rows: Row[]): ProfileFinding[];
  terms(record: Rec, manifestTerms: unknown): string[];
  checkpointTotals(records: Rec[]): Record<string, string>;
  codes: {
    recordWithoutRow: string;
    rowWithoutRecord: string;
    bindFailure: string;
    rowAgainstRefusal: string;
  };
};
```

`AuditInput.profile` defaults to `SPEND_PROFILE`. `DECISION_PROFILE` is
the second implementation. `trust` on that path is the effect-extract
signer, not a rail; `issuerTrust` is the decider. The field names did
not change.

`terms()` on the decision profile returns `[]`. Policy-document binding
is not exercised.

## `DecisionRecordClaims`

Copied from `packages/core/src/decision-record.ts`:

```
{
  decider: string;
  subject: string;
  requestHash: string;
  policyHash: string;
  inputsHash: string | null;
  decision: "allow" | "deny" | "defer";
  reasonCode: string;
  ref: string | null;          // required on allow
  effectHash: string | null;   // required on allow; the intended effect
  timestampMs: number;
  nonce: string;
  prevRecordHash: string | null;
}
```

CWT labels `-70501`…`-70512`. `-70401`/`-70402` are already the
countersignature claims. Content type
`application/cedulon-decision-record+cbor`. `CTY_DECISION` remains the
token. `decisionRecordHash` hashes the COSE Sign1 bytes (`coseHex`),
the same input `receiptHash` uses on the COSE path.

## `EffectExtractClaims`

Copied from `packages/effect-extract/src/effect.ts`:

```
EffectRow = { ref, effectHash, effectClass, timestampMs, actor? }
EffectExtractClaims = { deciderId, channelId, windowStartMs, windowEndMs, effects }
```

Content type `application/cedulon-effect-extract+cbor`. The body is
signed the way a rail extract is (JCS + detached). Shape refusals match
the rail helper: unknown field, inverted window, empty ref, hash grammar,
row outside the declared window.

## Finding codes (decision)

| Code | When |
|---|---|
| `decision-without-effect` | allow, no row (UNCONFIRMED) |
| `effect-without-decision` | row, no record (ORPHAN) |
| `effect-against-refusal` | deny/defer and a row on the same ref (worst) |
| `effect-mismatch` | allow, row, `effectHash` differs (SUBSTITUTION) |

`FINDING_CODES` is 54. The schema enum lists the same 54.

## Conservation (decision dialect)

`|R|` is the in-scope decision records. `|E|` is the effect rows.
The identities the spend report already publishes still hold; only the
words change:

```
|R| = aborted + settled
      aborted  = deny + defer
      settled  = allow
settled = matched + deferred + carried + unmatched + repeated + unreconciled
|E|     = matched + deferred + unmatched + repeated + unreconciled
matched on |R| equals matched on |E|
```

A closing-boundary allow whose `ref` the following extract names is
`carried`, not a finding. An allow with no extract at all is still a
finding: see the next section.

## Known gaps

- **FAIL from absence.** No extract ⇒ `ok=false`, `guarantee=conditional`,
  `unauthenticated-extract`. Same as spend. Known from the draft-abak -01
  review, 3 September. Not closed here.
- **Counter names.** `receipts` / `settlements` / `aborted` / `settled`
  are spend words on a decision report.
- **Effect signer independence** is a statement the verifier makes by
  pinning a key. Meta does not sign a DM dump. Until an independent
  process holds B, `guarantee` stays conditional; that is the axis,
  not a defect.
- **IG log shape** was not measured. `interop/mizan-ig` maps a proposed
  JSONL. The live `/opt/whatsapp-bridge` log is not in this repository.
- **Policy binding not exercised.** `terms()` is empty. A frozen rule
  document is not wired through the Trade Manifest path.

The tree now carries the profile, the two signed objects, twelve
conformance cases, and four offline IG fixtures; unproven until those
run against a measured log and a reader who did not write this branch.
