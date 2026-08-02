<div align="center">

# 🛡 vibeguard

### The AI code reality check.

**Your AI is confident. vibeguard is not.**

A zero-dependency **pre-commit guard** for your terminal, plus a browser-based **AI Studio**
that hunts bugs, finds vulnerabilities, audits live websites, and writes deploy-ready
reports — without ever uploading your keys or your code to anyone's server.

```
 v  i  b  e   c  o  d  e
 ──────────────────────────
 empty catch        →  🛑 blocked
 user.find().email  →  🛑 blocked
 invented env var   →  🛑 blocked
 hardcoded key      →  🛑 blocked
```

<br>

[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://github.com/thesajidalam/vibeguard)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](https://github.com/thesajidalam/vibeguard)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/thesajidalam/vibeguard/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/thesajidalam/vibeguard/ci.yml?branch=main&label=CI)](https://github.com/thesajidalam/vibeguard/actions)
[![Tests](https://img.shields.io/badge/tests-48%20%2F%2048-passing-brightgreen)](https://github.com/thesajidalam/vibeguard)
[![AI Studio](https://img.shields.io/badge/live%20studio-guardvibe.vercel.app-cyan)](https://guardvibe.vercel.app)

**▶ [Open the AI Studio](https://guardvibe.vercel.app)** · **`npm i -g vibeguard && vibeguard install`**

</div>

---

## About

Most "AI code review" tools are just *another LLM* bolted onto your workflow — slow,
costly, and happy to agree with you. vibeguard is the opposite:

**Deterministic. Offline. Millisecond-fast. It never gives your code a participation trophy.**

Vibe-coded code *looks* right. Clean formatting, confident names, plausible logic. But under
the polish, the same handful of bugs appear again and again — empty `catch {}` blocks that
swallow failures, `user.find(...).email` null-derefs that crash at 3am, `process.env.KEY`
variables that never existed, and hardcoded API keys waiting for Hacker News to notice.

vibeguard catches those exact patterns with **ten deterministic rules** — tuned for what
LLMs repeat most — and then offers an **optional AI deep dive** that actually disagrees with you.

### Two products, one guard

| | **CLI guard** | **AI Studio** |
|---|---|---|
| Where | your terminal, pre-commit | [guardvibe.vercel.app](https://guardvibe.vercel.app) |
| Scans | staged diffs, line by line | whole files, multi-file projects, GitHub repos |
| Verdict | deterministic, offline, instant | static scan + optional AI deep dive |
| AI | never | 7 modes · 8 free providers |
| Reports | exit codes `0` / `1` / `2` | download `.md` / `.html` / `.json` |
| Setup | `vibeguard install` | paste a free API key |

Both share the same ten rules. The Studio adds the layer on top: **an LLM that
disagrees with you, with line-level fixes.**

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

See it in action against a realistic AI-generated function — leaked keys, an invented
env var, a swallowed error, a null deref, a sleep-hack, dead imports, debug leftovers:

```bash
vibeguard demo
```

```bash
vibeguard scan .           # scan a whole repo
vibeguard check            # scan what's staged (default)
vibeguard doctor           # is my hook installed? what will it run?
```

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

## The 10 rules

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
Promote, mute, or retune any rule in `.vibeguard.yaml` (create one with `vibeguard init`):

```yaml
envfile: .env.example
rules:
  secret: error          # never ship keys
  swallow: error         # never eat errors
  debugprint: warn       # warnings don't block
  dummy: ignore          # you do you
```

---

## AI Studio

### Seven modes

| mode | what it does |
|---|---|
| **Static scan** | runs the 10 rules in your browser. No key needed. |
| **Bug finder** | hunts logic errors, race conditions, and runtime crashes |
| **Security audit** | looks for injection, secrets, auth gaps, and dependency risks |
| **Fix & explain** | rewrites the flagged code and explains every change |
| **API & deployment** | warns about config, secrets, CORS, and deploy blockers |
| **Full audit report** | the whole package, formatted like a professional security report |
| **Site Sentinel** | feeds any live URL to the AI — vibeguard resolves the page server-side, grabs its HTML, scripts, forms, inputs, links and visible text, then audits it for web vulnerabilities |

Every AI mode returns a **Risk Score /100**, a severity table
(Critical / High / Medium / Low), and per-issue fixes.

### Get code in three ways

- **Paste** code straight into the editor
- **Upload** files (or a whole folder)
- **Fetch from GitHub** — drop a repo URL into the terminal panel, and the Studio pulls
  the tree via the public API (up to 30 source files, oversized files safely skipped)
  and scans it in one click

### Scan a live website (Site Sentinel)

Drop any `http(s)://` URL into the **Site Sentinel** terminal and press Run. The relay
resolves the page server-side and feeds the grabbed content to your connected model:

- **SSRF-guarded** — private, loopback, link-local and cloud-metadata addresses are
  refused (DNS re-checked on every redirect hop)
- **Safe limits** — 8s timeout, 250 KB page cap, 6 redirect hops max
- The AI audits forms, inputs, loaded scripts, iframes, links, meta tags and visible
  text for exposed secrets, unsafe submissions, missing CSRF, risky third-party scripts,
  open redirects, information disclosure and more

### Providers (free tiers, no card required)

No model names or base URLs to type. Paste a key, hit **Test & connect**, and vibeguard
auto-detects the best working model for you — and retries other models automatically if
one fails.

| provider | key from | known models |
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
- Requests go **browser → relay → provider**; the relay is a stateless forwarder that
  **never logs or stores your key**
- Only whitelisted provider endpoints are reachable — the relay can't call anywhere else
- No keys ever touch our database, because there is no database

---

## Why it can be trusted

- **Zero dependencies.** A single Node script. No `node_modules`, no supply chain.
- **Zero LLM in the guard.** Deterministic rules. Same input, same verdict, always.
- **Zero network in the CLI.** Never uploads your code. Works on an airplane.
- **Keys never touch our server.** The Studio relay is a blind forwarder, nothing more.
- **Zero cost.** MIT licensed. Free forever. Star it if it earns it.

## Project layout

```
vibeguard/
├── bin/vibeguard.mjs     # the CLI entry point
├── src/                  # rules, scanner, git hooks, output
├── test/                 # 48 unit tests, zero test dependencies
├── demo/                 # realistic AI-generated sample code
├── api/                  # the AI Studio relay (Vercel serverless)
├── web/                  # the AI Studio front-end (static)
├── .vibeguard.yaml       # vibeguard's own config — it guards itself
└── vercel.json           # static + serverless routing
```

## Contributing

Open an issue. Open a PR. If you've been burned by a false-clean AI diff, you already know
why this exists — come make it sharper. `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and
`SECURITY.md` are all there.

---

<div align="center">

**vibeguard** — *Your AI is confident. vibeguard is not.*

built with ♥ by [@thesajidalam](https://github.com/thesajidalam) · MIT licensed ·
[docs](https://github.com/thesajidalam/vibeguard) · [issues](https://github.com/thesajidalam/vibeguard/issues) ·
[AI Studio](https://guardvibe.vercel.app)

</div>
