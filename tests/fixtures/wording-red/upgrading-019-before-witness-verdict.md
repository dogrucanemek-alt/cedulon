## 0.19.0 (prepared, not published)

`counts.receipts.attested` is only the receipts that verify under a usable
pinned issuer key. With no issuer pin stated, or a stated pin that cannot be
read, it is 0. The coverage-set size is reported beside it as
`counts.receipts.covering` (JSON and the `formatAudit` receipts line). Under a
usable pin the two are equal; without one, presented-unattested receipts can
still cover settlements while `attested` stays 0. Callers that treated the old
unpinned `attested` count as coverage must read `covering` instead.

What breaks: any consumer that assumed `attested` counted the pinless coverage
set, or that parsed the receipts counts line without a `covering=` field.

## 0.18.0: next
