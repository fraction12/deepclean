## Why

Deepclean has a useful report, plan, and handoff spine, but it is still missing the complete operating loop expected from a serious repo-maintenance tool. A strong cleanup system has to do more than produce a good first report: it must preserve stable finding identity, track lifecycle history, support incremental review, run in CI, revalidate findings, manage local state safely, expose provider controls, and eventually execute tightly-scoped fixes with proof.

This change specs the full target shape rather than a minimal next step. The intent is to make Deepclean a trustworthy local cleanup system for working-but-sloppy codebases, with agent-ready artifacts and deterministic safety rails before any source mutation is allowed.

## What Changes

- Add `doctor` and `status` commands for install, repo, config, state, provider, analyzer, git, and last-run health.
- Add stable candidate signatures so findings survive rescans, renumbering, and incremental runs.
- Add first-class lifecycle history for candidates, themes, reports, plans, handoffs, revalidations, and fix attempts.
- Add `revalidate` / `recheck` workflows that determine whether a candidate is still true, changed, fixed, stale, or superseded.
- Add incremental scan modes using git merge-base, `--since`, `--include-dirty`, path filters, and reviewer/category filters.
- Add CI mode with policy gates, SARIF/JSON/Markdown outputs, predictable exit codes, and baseline-aware failure behavior.
- Add report/list filtering by status, priority, category, risk, source, theme, path, age, owner, and lifecycle state.
- Add lock and concurrency controls for shared `.deepclean/` state.
- Add `prune` and retention controls for stale runs, artifacts, orphan records, and sensitive generated state.
- Add provider/runtime controls for model, provider, timeout, retries, rate limits, concurrency, token budget, privacy mode, and offline/local-only execution.
- Make synthesis the recommended serious-use path while preserving deterministic local scans.
- Add guarded one-candidate fix execution as a later capability: explicit opt-in, source changes limited to one target, verification required, no unapproved push or PR side effects.
- Update OpenSpec requirements and tasks to represent the whole product bar, not only the next small implementation batch.

## Impact

- CLI command surface.
- Project-local state schema and migration model.
- Candidate identity, ranking, filtering, lifecycle, and triage records.
- Evidence collection, synthesis, provider execution, and runtime config.
- Report, plan, handoff, CI, and release documentation.
- Test fixtures, state compatibility tests, and dogfood scorecards.

This proposal does not by itself implement behavior. It defines the complete change set so implementation can be phased without watering down the target.

## Non-Goals

- No remote service dependency for default operation.
- No uploading private source code unless the user explicitly configures a provider/privacy mode that permits excerpts.
- No multi-candidate or repo-wide autonomous rewriting.
- No automatic push, release, package publish, public post, or external side effect.
- No hidden reliance on OpenClaw workspaces, private agent instructions, or machine-local skills for default public behavior.
