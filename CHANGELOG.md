# Changelog

## Unreleased

- Hardened guarded fix/work so patch workers do not run verification themselves, and revalidation can record measurable metric-reduction campaign progress for partial cleanup PRs.

## 0.1.0-beta.2 - 2026-05-29

- Documented repeated `--verification` / `--verification-command` usage for guarded fix/work flows.
- Fixed repeated verification flags so guarded fix/work runs every explicit verification command instead of only the last one.

## 0.1.0-beta.1 - 2026-05-29

- Promoted the beta operating loop with candidate lifecycle state, richer status/progress output, guarded fix/work safety, proof-ledger revalidation, improved synthesis quality, dogfood gates, and beta onboarding.
- Added source-safe beta dogfood scorecards and release checks for the required beta evidence set.
- Ignored local generated system-design diagram artifacts so release checkouts stay clean.

## 0.1.0-alpha.3 - 2026-05-28

- Added candidate-first fix/work workflows with config gating, owned-file scope checks, required verification, revalidation, PR proof, and structured fix outcomes.
- Added broad-candidate splitting so large candidates can be decomposed into smaller child slices before source mutation.
- Hardened worker execution with bounded retries, idle/hard timeouts, repository-progress detection, and recovery when a timed-out worker still landed in-scope changes.
- Improved plan and fix-attempt safety by scoping plans to the current scan run and preventing stale candidate IDs from reusing older plans.
- Made source discovery ignore gitignored/generated output so generated site artifacts no longer pollute candidate discovery.
- Surfaced progress in `deepclean status` from existing run, lifecycle, split, and fix-attempt artifacts without adding a second progress ledger.
- Continued self-dogfood cleanup across synthesis, candidate evidence, CLI wrapper, and release-smoke utility slices.

## 0.1.0-alpha.2 - 2026-05-27

- Changed `scan` and CI-style scans to request Codex synthesis by default after local evidence collection, with `--evidence-only` as the deterministic-only escape hatch.
- Added synthesis attempt ledgers with validation checks, failure records for malformed provider output, and final candidate ID alignment after ranking.
- Included `.deepclean/synthesis/` in doctor/status/prune retention so synthesis artifacts are visible, validated, and cleaned up with the rest of a run.
- Refined the public site hero and motion treatment after UAT.

## 0.1.0-alpha.1 - 2026-05-27

- Added semantic feature mapping with `.deepclean/features/` artifacts, `deepclean map`, scan feature counts, and first-pass package script, TS/JS, Python, test-suite, route/component/module, and config feature records.
- Softened the public site, README, and package copy to frame Deepclean around clearer structure and focused improvements instead of criticizing the user's code.
- Set the GitHub Pages site as the public project homepage and documented it in the README.
- Added the complete operating loop: health/status, stable finding identity, lifecycle history, revalidation, incremental scans, CI policy mode, shared query filters, writer locks, retention pruning, source-safe exports, provider runtime controls, and guarded local fix attempts.
- Added explicit PR checkpoints and dogfood evidence for `complete-operating-loop-parity`.
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
- Hardened cleanup-surface mapping: TS/JS `.js` source specifiers now resolve to local TS source files, dynamic imports and `require(...)` are included in graph evidence, optional Semgrep orchestration is supported, report recommendations prefer strong synthesized findings over weak metric noise, and generated plans dedupe repeated file references.
