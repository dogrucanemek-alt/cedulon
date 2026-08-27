# Security

## Reporting a vulnerability

Email <e.dogru@conarium.dev>. Please do not open a public issue for something
that is exploitable; everything else is welcome in the tracker.

Useful in a report: the commit or published version you tested, the platform
and Node version, what you did, and what you expected instead. A failing
command is worth more than a paragraph.

## What you can expect

This is a small project with one maintainer, so there is no rota and no
guaranteed turnaround. What there is: I read that address, I will tell you I
received your report, and I will tell you what I am doing about it rather than
going quiet. If a report is correct and I cannot fix it quickly, the repository
will say so rather than the finding sitting unrecorded.

Findings from outside reviewers are written up in `docs/EXTERNAL_REVIEW.md`,
with the reporter credited, including the ones that showed the code
contradicting its own specification. That is the standard a report is held to
here, and the standard we hold ourselves to when answering one.

There is no bug bounty.

## Scope

In scope: the published packages under `@cedulon/*`, the MCP server and the
`.mcpb` bundle built from it, and the verification algorithm the drafts specify.

Out of scope, because they are demonstrations rather than product: the
in-process mock rail used by the examples, and the optional read-only testnet
demo, which opens a connection only to an RPC endpoint you supply yourself.

## What the server does and does not do

The MCP server runs locally over stdio, makes no network requests, and writes
to disk only when `CEDULON_STATE_PATH` is set. If you find that any of those
three statements is false, that is itself the vulnerability, and it is the one
I most want to hear about.
