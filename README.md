<div align="center">

# 🛡 vibeguard

### Your AI is confident. **vibeguard is not.**

A zero-dependency **pre-commit guard** plus a browser-based **AI Studio** that
finds bugs, hunts vulnerabilities, and writes deploy-ready reports for your
vibe-coded diffs — without ever uploading your keys or your code to our server.

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
[![AI Studio](https://img.shields.io/badge/live%20demo-vibeguard.vercel.app-cyan)](https://vibeguard.vercel.app)

**▶ [Open the AI Studio](https://vibeguard.vercel.app) — paste code, fetch a repo, or drop in files.**
**Static scan runs locally in your browser. AI modes need a free key from any of the providers below.**

</div>

---

## Two products, one guard

| | **CLI guard** | **AI Studio** |
|---|---|---|
| Where | your terminal, pre-commit | vibeguard.vercel.app |
| Scan | staged diffs, line by line | whole files, multi-file projects |
| Verdict | deterministic, offline, instant | static scan + optional AI deep dive |
| AI | never | 6 modes · 8 free providers |
| Reports | exit codes 0 / 1 / 2 | download `.md` / `.html` / `.json` |
| Setup | `npm i -g vibeguard && vibeguard install` | paste a free API key |

Both share the same ten deterministic rules. The Studio adds the extra layer:
**an LLM that actually disagrees with you.**

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
| Placeholder text, `your-api-key` | 😅 shipped to customers | ⚠️ warned |
| 800 lines added in one shot | 📖 "trust me, I read it" | ⚠️ flagged |

Most "AI code review" tools are just *another LLM* bolted onto your workflow — slow, costly,
and happy to agree with you. vibeguard is the opposite: **deterministic, offline, millisecond-fast,
and it never gives your code a participation trophy.**

---

## AI Studio

### Six modes

| mode | what it does |
|---|---|
| **Static scan** | runs the 10 rules in your browser. No key needed. |
| **Bug finder** | hunts logic errors, race conditions, and runtime crashes |
| **Security audit** | looks for injection, secrets, auth gaps, and dependency risks |
| **Fix & explain** | rewrites the flagged code and explains every change |
| **API & deployment** | warns about config, secrets, CORS, and deploy blockers |
| **Full audit report** | the whole package, formatted like a professional security report |

Every AI mode returns a **Risk Score /100** with a severity table
(Critical / High / Medium / Low) and per-issue fixes.

### Get code in three ways

- **Paste** code straight into the editor
- **Upload** files (or drag-and-drop a whole folder)
- **Fetch from GitHub** — paste a repo URL, the Studio pulls the tree via the public API
  (up to 30 source files) and scans it in one click

### Downloadable reports

After any scan you can download the full report as **Markdown**, styled **HTML**,
or machine-readable **JSON** — ready to attach to a PR, an issue, or a client.

### Providers (free tiers, no card required)

| provider | key from | models |
|---|---|---|
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-2.5-flash`, `gemini-2.5-pro` |
| Groq | [console.groq.com/keys](https://console.groq.com/keys) | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | many |
| Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai) | `llama-3.3-70b` |
| Mistral | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys/) | `mistral-small-latest` |
| GitHub Models | fine-grained PAT (`models:read`) | `openai/gpt-4o`, `openai/gpt-4o-mini` |
| NVIDIA NIM | [build.nvidia.com](https://build.nvidia.com) | `meta/llama-3.3-70b-instruct` |
| Custom | any OpenAI-compatible endpoint | your models |

### Key security

- Keys are stored **only in `localStorage`** in your browser
- Requests go **browser → relay → provider**; the relay is stateless, forwards your
  key to the provider, and **never logs or stores it**
- Only whitelisted provider endpoints are reachable — the relay can't call anywhere else
- No keys ever touch our database, because there is no database

---

## Quick start (CLI)

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

Or skip the install entirely — the [AI Studio](https://vibeguard.vercel.app) runs the
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
| `dummy` | placeholder text, `your-api-key`, `changeme`, `TODO`, `FIXME` | 🟡 warning |
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
- **Zero LLM in the guard.** Deterministic rules. The same input, the same verdict, always.
- **Zero network in the CLI.** Never uploads your code. Works on an airplane.
- **Keys never touch our server.** The Studio relay is a blind forwarder, nothing more.
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
[AI Studio](https://vibeguard.vercel.app)

</div>
