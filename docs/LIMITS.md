# Input limits

A verifier that accepts an unbounded object can be stopped by one. The
bounds below are enforced in this tree. An input that exceeds them is
refused with a named error; it is not truncated and it is not allowed
to run until memory or the stack gives out.

The largest honest audit in the suite is 41 receipts (case 86) and 51
inclusion receipts (case 79). The audit bounds are 100× the receipt
figure. The largest signed CBOR object in the suite is a few hundred
bytes.

| Bound | Value | Error | Where |
|---|---|---|---|
| CBOR input | 65 536 bytes | `cbor-too-large` | `decodeCbor` |
| CBOR nest depth | 16 | `cbor-too-deep` | `decodeCbor` |
| CBOR array / map entries | 4 096 | `cbor-too-large` | `decodeCbor` |
| CBOR text / byte string | 16 384 bytes | `cbor-too-large` | `decodeCbor` |
| Truncated additional-info | — | `cbor-eof` | `decodeCbor` |
| Duplicate map key | — | `cbor-duplicate-key` | `decodeCbor` |
| Audit receipts | 4 096 | `audit-too-large` | `audit()` |
| Audit settlements | 4 096 | `audit-too-large` | `audit()` |
| Audit checkpoints | 256 | `audit-too-large` | `audit()` |
| Audit inclusion receipts | 4 096 | `audit-too-large` | `audit()` |

Constants live next to the check: `CBOR_MAX_*` in `@cedulon/cose` and
`AUDIT_MAX_*` in `@cedulon/audit`. A third-party decoder that does not
apply the same bounds is answering a different question.

A map with a duplicate key is `cbor-duplicate-key` here. Other decoders
may keep the last value and say nothing. That split is fail-closed on
our side; it is not an agreement on the value.
