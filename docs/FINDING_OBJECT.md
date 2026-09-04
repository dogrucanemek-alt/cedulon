# Finding object (design note)

This is not a specification. `-01` says finding codes are diagnostic
identifiers, not an interop surface
(`spec/draft-dogru-cedulon-01.md`, the paragraph that begins "The
identifiers below are for diagnostic output"). That decision was
correct for `-01`: inventing a wire format in the same turn as the
codes would have frozen a guess.

The cost is that two implementations cannot compare findings
machine-to-machine. This note is the portable object we would emit
today, and the schema next to it is what `audit --json` already
satisfies. Whether that object becomes normative in `-02` is a later
call; the recommendation at the end is the one this tree would make.

## Envelope

```
{
  findingObjectVersion: 1,
  ok: boolean,
  guarantee: "unconditional" | "conditional",
  summary: string,          // same text formatAudit prints first
  receipts: number,         // counts.receipts.submitted, the total the audit measured
  findings: Finding[],      // severity is fail or omitted
  warnings: Finding[],
  scope?: AuditScope,       // the account, rail and window an extract declared
  counts: AuditCounts       // the class every row landed in
}
```

`ok` is true only when `findings` is empty. `guarantee` is
`unconditional` only when there are no warnings and the extract itself
was not doubted. Those two fields are the ones a consumer can act on
without understanding every code.

`counts` is the population the findings were drawn from: on the
receipt side how many were submitted, attested, in scope, aborted and
settled, and of the settled ones how many were matched, deferred,
carried into the next window, unmatched, repeated or left unreconciled;
on the settlement side the rows and the same classes less `carried`.
Every settled receipt and every row lands in exactly one class, so the
totals add up on both sides, and `matched` is the same number on each.
A row the audit rightly excluded without a finding, a receipt the next
window names or a spend that was aborted, is on the record here and
nowhere else (`EXTERNAL_REVIEW.md`, Round 5). `counts` is optional in
this object, because the posted draft asks no implementation for class
counts and another producer may not compute them; a producer that emits
it emits the whole shape. This implementation always emits it, and that
is a promise of the package, not of the schema.

## Finding

```
{
  code: string,             // diagnostic id from -01, or an extension
  id: string,               // subject (ref, nonce, epoch, "extract")
  detail: string,           // operator-facing sentence
  severity?: "fail" | "warn"
}
```

Decision-profile codes (0.13.0 prepared, not published):
`decision-without-effect` (allow, no row), `effect-without-decision`
(row, no record), `effect-against-refusal` (deny/defer and a row on
the same ref; the worst), `effect-mismatch` (allow, row, hash differs).

Unknown properties on a finding are allowed. The schema says so. A
producer may add `ref`, `amount`, or a language tag without a version
bump, as long as it does not rename or reuse `code` / `id` / `detail`.

## Relation to `guarantee`

`guarantee` is not a finding. It is a statement about the report. A
consumer that only understands `ok` and `guarantee` already knows
whether to treat the books as closed. Findings explain why.

A warning such as `unauthenticated-extract` keeps `ok` true and forces
`guarantee=conditional`. That split is the point of `MUST-T10-14`: the
human output already prints both. The JSON object must not hide either.

## Versioning

`findingObjectVersion` is an integer. A consumer that sees a version it
does not implement must not claim it understood the object. It may
still read `ok` and `guarantee` if those keys are present and typed as
here; that is a courtesy, not a contract.

Adding an optional field on a finding is not a version bump. Removing
or renaming a required envelope field is. Adding a new `code` is not a
version bump (see unknown codes). Adding an envelope member the schema
lists as optional is not one either, and a consumer that validates with
`additionalProperties: false` from an older copy of the schema will
refuse the new member until it updates the schema; `scope` and `counts`
both arrived that way, at version 1.

## Unknown codes

Carry-and-mark, not fail-closed on the code itself.

- If `ok` is false, an unknown `code` does not make the report
  healthier. Leave `ok` false.
- If `ok` is true and a finding or warning carries a code the consumer
  does not know, the consumer must not keep an unconditional
  guarantee. Mark the row (`unrecognized: true` is enough) and treat
  `guarantee` as conditional.
- The consumer must not invent a failure solely because a code is new.
  That would make adding a diagnostic a breaking change.

Fail-closed on the *envelope* (`ok`, `guarantee`) stays. Fail-closed on
an unknown *string* would punish evolution.

## Extensibility

New codes are lowercase kebab-case. A vendor prefix (`x-…`) is for
local diagnostics that will not be asked of another implementation.
Do not put a vendor prefix on a code that `-02` might later name.

## `-02` recommendation

Do not make this object normative in `-02`.

`-01` kept the codes diagnostic so two implementations could still
disagree on how they print. Turning the envelope into a MUST before a
second implementation has emitted it would freeze field names we have
only used ourselves.

What `-02` can say, if it says anything:

- An implementation that emits machine-readable findings MUST include
  `ok` and `guarantee` with the meanings already in `-01`.
- Finding `code` values remain diagnostic identifiers.
- A published JSON shape is optional (`MAY`) and, if used, SHOULD
  match this version-1 envelope.

The schema in `docs/finding-object.schema.json` is the running check
for that MAY, not a draft section.
