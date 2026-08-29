# Conformance vectors

These vectors are tied to a MUST in `draft-dogru-cedulon-03`. The
expected result is taken from the draft sentence cited next to each
vector, not from this repository's test suite. Running them against
the companion implementation is a check that the two have not
drifted; a split is a finding, not a licence to edit the expected
result.

Hex is lowercase. Times are POSIX milliseconds. Amounts match
`0|[1-9][0-9]*`. Windows are half-open `[start, end)` as
{{rail-extract}} states.

```bash
node --experimental-strip-types conformance/run.ts
```

This directory is not part of any published package.
