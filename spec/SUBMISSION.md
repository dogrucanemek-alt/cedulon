# Submitting draft-dogru-cedulon-00 (individual Internet-Draft)

This file is a preparation note. It is not a submission.

**Patron approval is required before any Datatracker upload, email to
the Secretariat, or announcement.** Cursor and Claude must not submit.

## Intended metadata (from the markdown source)

| Field | Value |
|---|---|
| Filename / docname | `draft-dogru-cedulon-00` |
| Title | Cedulon: An Audit Layer for Agent-to-Agent Commerce |
| Abbreviation | Cedulon |
| Intended status / category | Informational (`info`) |
| Stream | independent (`submissiontype: independent`) |
| IPR | `trust200902` (IETF Trust Legal Provisions) |
| Suggested area | `sec` |
| Working group | none (individual submission; not a WG item) |
| Date in source | 2026-08-26 |
| Author name | Emek Can Dogru |
| Author initials | E. C. Dogru |
| Affiliation | VERAX TEKNOLOJI LIMITED SIRKETI |
| Contact | listed in the draft; Datatracker account still needs patron approval |

## Author-tools render (2026-08-26)

Local `kramdown-rfc` remains WDAC-blocked on this machine. Regeneration
uses the public Author Tools API (no Datatracker API key):

```
curl.exe -sS -X POST https://author-tools.ietf.org/api/render/xml ^
  -F "file=@spec/draft-dogru-cedulon-00.md"
# JSON: { "logs": { "errors": [] }, "url": "https://author-tools.ietf.org/api/export/<id>/draft-dogru-cedulon-00.xml" }

curl.exe -sS -L "<xml-url>" -o spec/draft-dogru-cedulon-00.xml

curl.exe -sS -X POST https://author-tools.ietf.org/api/render/text ^
  -F "file=@spec/draft-dogru-cedulon-00.md"
# JSON: { "logs": { "errors": [] }, "url": ".../draft-dogru-cedulon-00.txt" }

curl.exe -sS -L "<txt-url>" -o spec/draft-dogru-cedulon-00.txt

curl.exe -sS -X POST https://author-tools.ietf.org/api/idnits ^
  -F "file=@spec/draft-dogru-cedulon-00.txt"
```

`spec/draft-dogru-cedulon-00.xml` and `.txt` are the Author Tools
render of this markdown. Re-run the commands after any source edit.

## idnits

Target: 0 errors (`**`). Warnings about first-submission date are
expected for a -00 that has never been posted.

## Individual submission steps (do not run until patron says so)

Sources: [authors.ietf.org submitting](https://authors.ietf.org/submitting-your-internet-draft),
[Datatracker submit tool](https://datatracker.ietf.org/submit/),
[I-D guidelines](https://ietf.github.io/id-guidelines/).

1. Confirm `spec/draft-dogru-cedulon-00.xml` matches the markdown
   (Author Tools logs.errors empty).
2. Create or use an IETF Datatracker account for Emek Can Dogru.
3. Open `https://datatracker.ietf.org/submit/` while logged in.
4. Upload the `.xml`. The tool will generate text and HTML.
5. Confirm the parsed metadata matches the table above.
6. **Stop and wait for patron approval** if it has not already been
   given in writing for this exact file hash.
7. After approval only: click through posting.
8. Do not mail `iesg@`, do not request a working group, do not claim
   IETF consensus. This remains an individual informational draft.

Blackout: I-Ds are refused between the pre-meeting cutoff and the
session start. Check `https://www.ietf.org/how/meetings/` dates before
any approved submit.

## Out of scope for this repository pass

- No Datatracker upload.
- No DNS, GitHub push, or Vercel action.
