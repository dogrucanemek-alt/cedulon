## 0.19.0 (prepared, not published)

`counts.receipts.attested` is only the receipts that verify under a usable
pinned issuer key. With no issuer pin stated, or a stated pin that cannot be
read, it is 0. The coverage-set size is reported beside it as
`counts.receipts.covering` (JSON and the `formatAudit` receipts line). Under a
usable pin the two are equal; without one, presented-unattested receipts can
still cover settlements while `attested` stays 0. Callers that treated the old
unpinned `attested` count as coverage must read `covering` instead.

Without an issuer pin, or with a stated pin that cannot be read, a witness
body no longer produces `checkpoint-withheld` or `equivocation`. That body is
reported as the conditional warning `witness-entry-unattributable` instead
(MUST-T11-16). This is a verdict change: an unpinned audit that failed in
0.18.0 for a same-key withheld or twin body can now return conditional with
no failing finding from that body alone. Under a usable issuer pin the same
bodies still fail as `checkpoint-withheld` / `equivocation`.

Coverage and diagnostic sets are separated. A checkpoint the usable pin
rejects leaves the coverage set and the coverage chain walk; it is named as
`issuer-key-mismatch` (or a decoder refusal) and does not cover a window. A
stated pin that cannot be read reports `trust-key-unreadable`, keeps
`attested` and `covering` at 0, and still names decoder refusals on the
diagnostic set rather than falling back to carried keys. Bound checks still
throw `audit-too-large` before the safety net turns other surprises into
`presented-object-malformed`.

What breaks: any consumer that assumed `attested` counted the pinless coverage
set, that parsed the receipts counts line without a `covering=` field, or that
treated an unpinned witness body as a failing `checkpoint-withheld` /
`equivocation` verdict.

## 0.18.0: next
