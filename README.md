<p align="center">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="0 dependencies">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="node >=18">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/github/actions/workflow/status/thesajidalam/vibeguard/ci.yml?branch=main&label=CI" alt="CI">
  <img src="https://img.shields.io/badge/tests-39%20%2F%2039-passing-brightgreen" alt="39/39 tests passing">
  <img src="https://img.shields.io/badge/built%20by-%40thesajidalam-orange" alt="built by @thesajidalam">
</p>

```
 __      __     _                      _
 \ \    / /__ _| |__  __ _  __ _  __ _| |_  ___  _ _
  \ \/\/ / _` | '_ \/ _` |/ _` |/ _` | ' \/ -_)| ' \
   \_/\_/\__,_|_.__/\__,_|\__, |\__,_|_||_\___||_||_|
                          |___/
      the AI code reality check. built by @thesajidalam
```

# vibeguard

> **Vibe-coded code *looks* right. vibeguard proves it isn't.**

Your AI copilot generated 400 lines of confidence. vibeguard scans every diff for the 7 kinds of
"false clean" bugs AI models are **statistically obsessed** with — the empty `catch` blocks that
swallow errors, the `null` you confidently `.find()` into, the `process.env.X` nobody ever wrote,
the `sk-live-...` key that just made it to GitHub.

Attach it to git once. From then on, **a bad diff literally cannot be committed.**

---

## The 60-second install

```bash
npm install -g vibeguard
cd your-project
vibeguard install          # adds the pre-commit hook (one line)
```

Done. The next time you (or your AI) stage a red-flagged diff, `git commit` refuses:

```
✘ BLOCKED — 4 errors, 3 warnings ([#---------] 5/100)
  Your AI is confident. vibeguard is not.
  fix what's red, then vibeguard lets you through — built by @thesajidalam
```

## Why this is different

Most "AI code review" tools are another LLM bolted onto your workflow — slow, costly, and it'll
*agree with you*. vibeguard is the opposite:

| | vibe coding | vibeguard |
|---|---|---|
| The diff | "looks right" | scanned line-by-line |
| Empty `catch {}` | ✨ silent | 🛑 blocked |
| `user.find(...).email` on null | 💥 prod outage | 🛑 blocked |
| `process.env.KEY` that never existed | 🔇 fails at runtime | 🛑 blocked |
| hardcoded API key | 🚨 on Hacker News | 🛑 blocked |
| `lorem ipsum` / `your-api-key` | 😅 shipped | ⚠️ warned |

**Zero dependencies. Zero LLM. Zero excuses.** It runs in milliseconds on every commit, works
offline, and never uploads your code anywhere.

## The wow moment

```bash
vibeguard demo
```

Runs the tool against a realistic AI-generated function — the kind your copilot writes at 1am
when it's "pretty sure this works." Watch it catch **all seven** bugs at once. Then run it on your
own repo and feel the mood change:

```bash
vibeguard scan .      # scan everything
vibeguard check       # check your staged changes
vibeguard doctor      # is my hook installed? what will it run?
```

## The 10 rules

| rule | what it catches | severity |
|---|---|---|
| `secret` | hardcoded API keys, passwords, private keys | 🔴 error |
| `envhole` | reads `process.env.X` never declared in `.env.example` | 🔴 error |
| `swallow` | empty `catch {}` blocks that erase failures | 🔴 error |
| `nullaccess` | `.find()` / `.match()` results dereferenced with `.` | 🔴 error |
| `sleepfix` | `await sleep(...)` hacks instead of real fixes | 🟠 error |
| `dummy` | `lorem ipsum`, `your-api-key`, `changeme`, `TODO` | 🟡 warning |
| `debugprint` | `console.log` / `debugger` left in non-test code | 🟡 warning |
| `deadimport` | imports nobody uses | 🟡 warning |
| `minified` | minified/bundled files committed to source | 🟡 warning |
| `bignew` | a new file big enough that nobody read it | 🟡 warning |

Every rule can be tuned, muted, or promoted to a hard error in `.vibeguard.yaml`:

```yaml
envfile: .env.example
rules:
  secret: error          # never ship keys
  swallow: error         # never eat errors
  debugprint: warn       # warnings don't block
  dummy: ignore          # you do you
```

## Commands

```
vibeguard check          scan staged changes (default)
  --all                  scan the full diff vs the default branch
  --base <ref>           scan the diff since a specific ref
  --json                 machine-readable output for CI
  --quiet                only print problems
vibeguard scan <path>    scan a directory or file
vibeguard init           write .vibeguard.yaml
vibeguard install        add the pre-commit hook
vibeguard uninstall      remove the pre-commit hook
vibeguard doctor         verify your setup
vibeguard demo           the wow moment
```

## Exit codes (CI-friendly)

| code | meaning |
|---|---|
| `0` | clean, or warnings only |
| `1` | blocked — errors found |
| `2` | usage error / can't read the repo |

## Dogfooding

vibeguard guards itself. This repo runs `vibeguard scan .` as a pre-commit hook, and its own
source trips the warnings you see above — because the literal words `lorem ipsum`, `changeme`, and
`TODO` are defined right there in the pattern table. A tool that strict is the one you want on
your commits. Check out the tests: **39 test cases, zero test dependencies**, `npm test`.

## Contributing

Open an issue. Open a PR. This is a young tool built for a whole generation of code that never
met a reviewer. If you've been burned by a false-clean AI diff, you already know why this exists.

---

<p align="center">
  <strong>vibeguard</strong> — <em>Your AI is confident. vibeguard is not.</em><br>
  built with ❤️ by <a href="https://github.com/thesajidalam">@thesajidalam</a> · MIT licensed
</p>
