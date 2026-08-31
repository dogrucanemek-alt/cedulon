# CPB -02 vectors against Cedulon's RFC 8785 encoder

This probe runs the conformance vectors published with
draft-mih-sokolov-scitt-payload-binding-02 (Canonical Payload Binding,
CPB) through the JSON canonicalization Cedulon ships in `@cedulon/core`
and compares the digests. It was written for a consuming-side reading
of -02, reported to the SCITT list on 31 August 2026.

The vectors are fetched at run time from the CPB repository at a pinned
commit and are not copied into this tree, because that repository
carries no license file:

    action-state-group/scitt-payload-binding @ eba249c8518bbf417068fb911f7bafa66e214d12

## Run

    npm run build:packages
    node interop/cpb-02/measure.mjs

The script exits 0 when every plain-RFC-8785 known-answer vector and
every subject-binding-diff vector matches under algorithm `jcs`, and 1
otherwise. Network access to raw.githubusercontent.com is required.

## Reading the table

- `plain RFC 8785`: the vector's normalized form equals its input after
  exclusion, so the pinned digest is a plain JCS digest. Cedulon's
  `canonical()` must reproduce it byte for byte.
- `jcs-n normalization applies`: the withdrawn jcs-n pass removed a
  null, empty-array or empty-object member. Plain `jcs` keeps them, so
  the digests must differ.
- `MUST-FAIL under jcs-n`: the input is refused by the withdrawn
  algorithm's rules (floats, integers beyond 2^53, exponent form, the
  `-0` token, duplicate keys, NFC deviation, escape form). Plain `jcs`
  admits them and leaves any restriction to the payload profile; the
  table shows what Cedulon's encoder does with each. Cedulon's own
  profile restricts amounts to decimal strings and time fields to
  integers within 2^53, and refuses a duplicate member name in extract
  text before parsing (`json-duplicate-key`), which the last line of
  the output measures directly on the raw vector files.
- `subject-binding-diff`: the vectors that discriminate `jcs` from
  `jcs-n`; each pins both digests.

## Output at commit 42cd0fd, 31 August 2026

```
jcs-n-kat-01                             | plain RFC 8785                                 | MATCH
jcs-n-kat-02                             | jcs-n normalization applies                    | differs, as jcs must
jcs-n-kat-03                             | jcs-n normalization applies                    | differs, as jcs must
jcs-n-kat-04                             | jcs-n normalization applies                    | differs, as jcs must
jcs-n-kat-05                             | plain RFC 8785                                 | MATCH
jcs-n-kat-06                             | jcs-n normalization applies                    | differs, as jcs must
jcs-n-kat-07                             | jcs-n normalization applies                    | differs, as jcs must
jcs-n-kat-08                             | plain RFC 8785                                 | MATCH
jcs-n-kat-09                             | plain RFC 8785                                 | MATCH
jcs-n-kat-10                             | MUST-FAIL under jcs-n: float_in_digest_bearing_field | admitted under jcs: b08a3124c716
jcs-n-kat-11                             | plain RFC 8785                                 | MATCH
jcs-n-kat-12                             | plain RFC 8785                                 | MATCH
jcs-n-nfc-contrast-01                    | MUST-FAIL under jcs-n: nfc_normalisation_deviation | admitted under jcs: 0b985be82ae9
jcs-n-kat-14                             | jcs-n normalization applies                    | differs, as jcs must
jcs-n-kat-15                             | MUST-FAIL under jcs-n: float_in_digest_bearing_field | admitted under jcs: e58bdad0b32b
jcs-n-kat-16                             | MUST-FAIL under jcs-n: unsafe_integer_in_digest_bearing_field | admitted under jcs: 5aacfb1bcf25
jcs-n-kat-17                             | MUST-FAIL under jcs-n: integer_formatting_divergence | admitted under jcs: 906dba64e1a9
jcs-n-kat-18                             | plain RFC 8785                                 | MATCH
jcs-n-kat-19                             | plain RFC 8785                                 | MATCH
jcs-n-kat-20                             | n/a: typed-reference representation vector     | -
jcs-n-kat-21                             | n/a: typed-reference representation vector     | -
jcs-n-kat-22                             | plain RFC 8785                                 | MATCH
jcs-n-kat-23                             | plain RFC 8785                                 | MATCH
jcs-n-kat-24                             | plain RFC 8785                                 | MATCH
jcs-n-kat-25                             | plain RFC 8785                                 | MATCH
jcs-n-kat-26                             | plain RFC 8785                                 | MATCH
jcs-n-esc-uppercase-contrast             | MUST-FAIL under jcs-n: string_escape_uppercase_hex | admitted under jcs: f5d570fa6125
jcs-n-tab-long-form-contrast             | MUST-FAIL under jcs-n: string_escape_long_form_for_named_char | admitted under jcs: 7ac9c6bd87cd
jcs-n-control-key-escaped-sort-contrast  | MUST-FAIL under jcs-n: key_sort_by_escaped_bytes_not_code_units | admitted under jcs: 64e35d3d1ba0
jcs-n-kat-30                             | plain RFC 8785                                 | MATCH
jcs-n-kat-31                             | plain RFC 8785                                 | MATCH
jcs-n-kat-32                             | MUST-FAIL under jcs-n: float_in_digest_bearing_field | admitted under jcs: 76c365dbd84f
jcs-n-kat-33                             | plain RFC 8785                                 | MATCH
jcs-n-kat-34                             | plain RFC 8785                                 | MATCH
jcs-n-kat-35                             | MUST-FAIL under jcs-n: invalid_wire_number_token | admitted under jcs: 618de7d9f46f
jcs-n-kat-36                             | plain RFC 8785                                 | MATCH
jcs-n-kat-37                             | MUST-FAIL under jcs-n: duplicate_key           | admitted under jcs: 7e8059f49558
jcs-n-kat-38                             | plain RFC 8785                                 | MATCH
subject-binding-diff-01                  | subject-binding-diff                           | MATCH jcs; differs from jcs-n, as designed
subject-binding-diff-02                  | subject-binding-diff                           | MATCH jcs; differs from jcs-n, as designed
subject-binding-diff-03                  | subject-binding-diff                           | MATCH jcs; differs from jcs-n, as designed
subject-binding-diff-04                  | subject-binding-diff                           | MATCH jcs; differs from jcs-n, as designed

CPB action-state-group/scitt-payload-binding@eba249c: plain-RFC-8785 known-answer vectors 19/19 match; subject-binding-diff 4/4 match jcs
raw vector files carrying a duplicate member name: 37-must-fail-duplicate-key ("a")
```

The three escape and sort contrast vectors are admitted because the
encoder produces the correct-form digest for each (they equal the
digests pinned by kat-23, kat-24 and kat-26); the vectors exist to
catch encoders that produce the wrong form. `jcs-n-kat-37` is admitted
by `canonical()` only because the harness hands it an already-parsed
object; the raw file is refused by `jsonDuplicateMemberName`, as the
last line shows.
