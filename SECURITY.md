# Security Policy

vibeguard reads code, so it sees secrets by design. The tool itself must never leak them.

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ |

## Reporting a vulnerability

**Do not open a public issue.** Report privately to sajidalamhere@gmail.com with the subject
line `[vibeguard-security] ...`.

Please include:

- The version affected
- A minimal reproduction (code snippet is fine — redact any real secrets)
- Impact and any suggested fix

You will get an acknowledgment within 72 hours and a plan for a fix + coordinated disclosure.

## What vibeguard does with your code

- Everything runs **locally**. No network calls, no telemetry, no LLM, no uploads.
- If you commit a `sk-...` key, vibeguard stops the commit — it does not report it anywhere.
- `--json` output is for your CI. Pipe it, don't publish it.
