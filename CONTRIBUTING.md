# Contributing to vibeguard

Thanks for helping vibeguard grow. This project was born from one observation: AI-generated
code *looks* right. Every contribution that makes that less true is welcome.

## Getting started

```bash
git clone https://github.com/thesajidalam/vibeguard.git
cd vibeguard
npm test            # 39 tests, zero dependencies, ~half a second
npm run demo        # the wow moment
node bin/vibeguard.mjs scan .
```

## How to contribute

1. **Open an issue first** for anything non-trivial — a 2-line rule tweak can go straight to a PR.
2. Fork, branch off `main`, keep the diff small.
3. Add or update tests in `test/` — every rule ships with tests.
4. Run `npm test` until everything is green.
5. PR against `main` with a clear description of what the change does and why it matters.

## Project conventions

- **Zero runtime dependencies** is a hard rule. A new dependency needs a very good reason.
- **ESM only**, Node >= 18, no build step. Code runs exactly as written.
- **No comments in code unless they earn their place.** Rule *messages* are user-facing copy.
- **Generated content** must never contain the literal word `lorem` — vibeguard's own `dummy`
  rule flags it, so "placeholder" wording is used instead.
- **Colors** flow through `src/ansi.mjs` (respects `NO_COLOR`); ASCII branding lives in
  `src/logo.mjs`; every report line credits `@thesajidalam`.
- **Exit codes**: `0` clean/warnings, `1` blocked, `2` usage/broken. Never change these.
- Test fixtures intentionally contain bad code — that's the point. `test/**` and `demo/**`
  are excluded from vibeguard's self-scan via `.vibeguard.yaml`.

## Style

- 2-space indentation, single quotes, semicolons.
- Prefer small pure functions. `src/engine.mjs` sorts findings; rules are stateless.
- User-facing strings in `src/report.mjs` / `src/rules.mjs` should be short and punchy.

## Reporting bugs / security

Open an issue, or read [`SECURITY.md`](SECURITY.md) for reporting a vulnerability privately.
