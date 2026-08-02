<div align="center">

# 🛡 vibeguard

### Your AI is confident. **vibeguard is not.**

A zero-dependency, deterministic pre-commit guard that catches the **"false-clean" bugs**
AI models keep shipping — empty `catch {}` blocks, null derefs, invented env vars,
and the API key that just hit GitHub.

**One install. Every commit. Zero excuses.**

```
 __      __     _                      _
 \ \    / /__ _| |__  __ _  __ _  __ _| |_  ___  _ _
  \ \/\/ / _` | '_ \/ _` |/ _` |/ _` | ' \/ -_)| ' \
   \_/\_/\__,_|_.__/\__,_|\__, |\__,_|_||_\___||_||_|
                          |___/
     the AI code reality check · built by @thesajidalam
```

<br>

[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://github.com/thesajidalam/vibeguard)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](https://github.com/thesajidalam/vibeguard)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/thesajidalam/vibeguard/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/thesajidalam/vibeguard/ci.yml?branch=main&label=CI)](https://github.com/thesajidalam/vibeguard/actions)
[![Tests](https://img.shields.io/badge/tests-48%20%2F%2048-passing-brightgreen)](https://github.com/thesajidalam/vibeguard)
[![Live demo](https://img.shields.io/badge/live%20demo-guardvibe.vercel.app-cyan)](https://guardvibe.vercel.app)

**▶ [Try it live in your browser](https://guardvibe.vercel.app) — paste your own code. It runs locally, nothing is uploaded.**

</div>

---

## The problem

Vibe-coded code *looks* right. Clean formatting. Confident names. Plausible logic.
Your copilot has never once asked you to double-check it.

But under the polish, the same handful of bugs appear **again and again**:

| | vibe coding | vibeguard |
|---|---|---|
| The diff | "looks right" | scanned line-by-line, every time |
| Empty `catch {}` | ✨ silent failure | 🛑 blocked |
| `user.find(...).email` on null | 💥 prod outage at 3am | 🛑 blocked |
| `process.env.KEY` that never existed | 🔇 dies at runtime | 🛑 blocked |
| Hardcoded API key | 🚨 on Hacker News | 🛑 blocked |
| `lorem ipsum`, `your-api-key` | 😅 shipped to customers | ⚠️ warned |
| 800 lines added in one shot | 📖 "trust me, I read it" | ⚠️ flagged |

Most "AI code review" tools are just *another LLM* bolted onto your workflow — slow, costly,
and happy to agree with you. vibeguard is the opposite: **deterministic, offline, millisecond-fast,
and it never gives your code a participation trophy.**

## Quick start

```bash
npm install -g vibeguard
cd your-project
vibeguard install          # attach the pre-commit hook
```

That's it. The next time you — or your AI — stage a red-flagged diff, `git commit` refuses:

```
✘ BLOCKED — 4 errors, 3 warnings ([#---------] 5/100)
  Your AI is confident. vibeguard is not.
  fix what's red, then vibeguard lets you through.
```

Also gate your pushes (scans the full diff, not just staged):

```bash
vibeguard install --pre-push
```

## The wow moment

Run vibeguard against a realistic AI-generated function and watch it catch a
**whole stack of bugs at once** — leaked keys, an invented env var, a swallowed
error, a null deref, a sleep-hack, dead imports, debug leftovers:

```bash
vibeguard demo
```

Then run it on your own work:

```bash
vibeguard scan .           # scan a whole repo
vibeguard check            # scan what's staged (default)
vibeguard doctor           # is my hook installed? what will it run?
```

Or skip the install entirely — the [live demo](https://guardvibe.vercel.app) runs the
same rules **in your browser**. Paste your copilot's output. Nothing leaves your machine.

## The 10 rules

Tuned for the exact patterns LLMs repeat most. Every rule is configurable.

| rule | what it catches | severity |
|---|---|---|
| `secret` | hardcoded API keys, passwords, private keys, JWTs | 🔴 error |
| `envhole` | `process.env.X` / `os.getenv("X")` never declared, no fallback | 🔴 error |
| `swallow` | empty `catch {}` / `except: pass` blocks that erase failures | 🔴 error |
| `nullaccess` | `.find()` / `.querySelector()` / `JSON.parse()` results dereferenced with `.` | 🔴 error |
| `sleepfix` | `sleep()` hacks in production code that hide races | 🔴 error |
| `dummy` | `lorem ipsum`, `your-api-key`, `changeme`, `TODO`, `FIXME` | 🟡 warning |
| `debugprint` | `console.log` / `print()` / `debugger` left in non-test code | 🟡 warning |
| `deadimport` | imports nobody ever uses | 🟡 warning |
| `minified` | 400+ character lines — minified or pasted blobs | 🟡 warning |
| `bignew` | a new file big enough that nobody read it | 🟡 warning |

Errors block the commit. Warnings let you through — but they *are* being watched.
Promote, mute, or retune any rule in `.vibeguard.yaml`:

```yaml
envfile: .env.example
rules:
  secret: error          # never ship keys
  swallow: error         # never eat errors
  debugprint: warn       # warnings don't block
  dummy: ignore          # you do you
```

Create one with `vibeguard init`.

## Commands

```
vibeguard check           scan staged changes (default)
  --all                   scan the full diff vs the default branch
  --base <ref>            scan the diff since a specific ref
  --json                  machine-readable output for CI
  --quiet                 only print problems
vibeguard scan <path>     scan a directory or file
vibeguard init            write .vibeguard.yaml
vibeguard install         add the pre-commit hook
  --pre-push              also add the pre-push gate (check --all)
vibeguard uninstall       remove the hooks
vibeguard doctor          verify your setup
vibeguard demo            the wow moment
vibeguard version, -v     print version
vibeguard help, -h        this screen
```

## Exit codes (CI-friendly)

| code | meaning |
|---|---|
| `0` | clean, or warnings only |
| `1` | blocked — errors found |
| `2` | usage error / can't read the repo |

```bash
vibeguard check --json    # drop this into any pipeline
```

## Why it can be trusted

- **Zero dependencies.** A single Node script. No `node_modules`, no supply chain.
- **Zero LLM.** Deterministic rules. The same input, the same verdict, always.
- **Zero network.** Never uploads your code. Works on an airplane.
- **Zero cost.** MIT licensed. Free forever. Star it if it earns it.

## Dogfooding

vibeguard guards itself. This repo runs `vibeguard scan .` as its own pre-commit hook, and its
source trips its own warnings on purpose — the literal patterns live right there in the code.
A tool that strict is exactly the one you want watching *your* commits.

**48 test cases. Zero test dependencies.** `npm test`.

## Contributing

Open an issue. Open a PR. If you've been burned by a false-clean AI diff, you already know
why this exists — come make it sharper. `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and
`SECURITY.md` are all there.

---

<div align="center">

**vibeguard** — *Your AI is confident. vibeguard is not.*

built with ❤️ by [@thesajidalam](https://github.com/thesajidalam) · MIT licensed ·
[docs](https://github.com/thesajidalam/vibeguard) · [issues](https://github.com/thesajidalam/vibeguard/issues) ·
[live demo](https://guardvibe.vercel.app)

</div>
