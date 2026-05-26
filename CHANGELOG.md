# Changelog

## Unreleased

- Added repo-specific verification inference so generated candidates and plans point at real local checks such as Makefile targets, frontend package scripts, and admin package scripts instead of generic commands.
- Added explicit `reportPath`, `markdownPath`, `jsonPath`, and `planPath` fields to JSON output for automation.
- Improved Markdown reports with a focused `Agent Queue`, bounded themes before too-broad themes, and a capped candidate appendix while preserving full raw records in JSON.

## 0.1.0-alpha.0 - 2026-05-24

- Added the public-alpha CLI package surface with installable `deepclean` binary metadata.
- Added global flag parsing before or after commands, including `deepclean --root ./repo scan --synthesize`.
- Added configurable local candidate caps, broad-theme splitting, and too-broad theme warnings.
- Added report recommendations with `Start Here`, suggested plan targets, theme warnings, and machine-readable recommendation data.
- Added configurable reviewer packs with built-in reviewer selection and source-safe custom reviewer path loading.
- Added privacy/trust and troubleshooting docs.
- Added package smoke testing from the packed tarball.
- Added CI and release checks that reject private/local artifacts from the package tarball.
- Added SARIF ingestion and optional `jscpd` external duplicate evidence.
- Removed self-dogfood state from the repo working tree and tightened ignore rules for local artifacts.
- Added a vendored MIT-licensed Matt Pocock skills reference snapshot and distilled reviewer rubrics for deep module discipline, feedback loops, and agent-ready cleanup slices.
- Hardened Clawpatch-style deslop mapping: TS/JS `.js` source specifiers now resolve to local TS source files, dynamic imports and `require(...)` are included in graph evidence, optional Semgrep orchestration is supported, report recommendations prefer strong synthesized findings over weak metric noise, and generated plans dedupe repeated file references.
