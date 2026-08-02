# Changelog

All notable changes to vibeguard are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
