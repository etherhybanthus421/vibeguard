# Changelog

All notable changes to vibeguard are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `web/` — the source of the live interactive landing page at **guardvibe.vercel.app**.
  Paste your own code and watch vibeguard catch it in your browser (faithful client-side
  port of the rules, zero uploads, zero servers). Includes favicon.
- Root-level `vercel.json` that routes the static site to `web/`, so the repo deploys to
  Vercel without changing the Root Directory setting.

## [1.0.1] - 2026-08-02

### Fixed
- `vibeguard demo` now exits `1` (blocked) when the fixture is rejected, matching the
  blocked report it prints. Previously it always exited `0`.
- The binary no longer dumps a raw stack trace on unexpected errors — it reports a clean
  message, points at the issue tracker, and exits `2`.
- `vibeguard ... | head` style piping no longer crashes with `EPIPE`.
- `install --pre-push` was advertised in help but not implemented — it now really installs
  the pre-push gate (`check --all`), and `doctor` reports both hooks.
- `-h` / `-help` / `-v` short flags now work.

### Added
- 8 end-to-end CLI tests (subprocess: flags, exit codes, demo, scan, non-repo `check`).
  Test suite is now 47 cases, still zero test dependencies.

## [1.0.0] - 2026-08-02

### Added
- Initial public release.
- `vibeguard check` — scans staged changes against 10 rules (`--all`, `--base`, `--json`, `--quiet`).
- `vibeguard scan <path>` — scans a directory or file directly.
- `vibeguard install` / `uninstall` — git pre-commit hook management.
- `vibeguard init` — writes a tuned `.vibeguard.yaml`.
- `vibeguard doctor` — verifies the installation and hook.
- `vibeguard demo` — the "wow moment": one vibe-coded function, seven caught bugs.
- 10 rules: `secret`, `envhole`, `swallow`, `nullaccess`, `sleepfix`, `dummy`, `debugprint`, `deadimport`, `minified`, `bignew`.
- Zero runtime dependencies. Custom YAML parser and glob engine. No LLM involved.
- Full test suite: `npm test` (39 cases, zero test dependencies).
