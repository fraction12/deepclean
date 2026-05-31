## PR Checkpoints

Each slice below MUST land through its own pull request unless an adjacent slice is explicitly marked as a no-code documentation-only follow-up. Every PR MUST include local verification evidence, GitHub CI, and a short dogfood note when the slice changes runtime behavior.

- [x] PR-01 State foundation: schemas, lazy migration, compatibility fixtures, and privacy notes for generated records.
- [x] PR-02 Health/status: `doctor`, `status`, structured diagnostics, and user docs.
- [x] PR-03 Stable identity: signatures, durable finding IDs, observation linking, lifecycle event persistence, and `history`.
- [x] PR-04 Revalidation: `revalidate`, outcome classification, freshness metadata, report badges, and lifecycle updates.
- [x] PR-05 Incremental scans: git/ref/path/reviewer scoped scanning, baseline metadata, dirty-tree provenance, and tests.
- [x] PR-06 CI mode: `deepclean ci`, policy gates, baseline-aware failures, CI artifacts, and GitHub Actions docs.
- [x] PR-07 Query/report filters: `list` or `findings`, shared filter model, baseline comparison, queue exports, and handoff freshness checks.
- [x] PR-08 Locks/concurrency: writer locks, stale lock reporting, recovery guidance, and contention tests.
- [x] PR-09 Retention/sharing: `prune --dry-run`, applied prune manifests, scrub/export, retention safety tests, and privacy docs.
- [x] PR-10 Provider/runtime controls: provider/model/runtime flags, timeout/rate-limit diagnostics, offline/local-only modes, and synthesis docs.
- [x] PR-11 Guarded fix execution: explicit opt-in fix flow, clean-tree guard, dry-run patch preview, verification capture, and no external side effects.
- [x] PR-12 Final hardening: full dogfood on Deepclean, source-safe larger-repo dogfood, release docs, changelog, and final OpenSpec validation.

## 1. Product Spec and State Foundation

- [x] 1.1 Define stable finding, observation, lifecycle event, revalidation, CI run, lock, retention manifest, and fix attempt schemas.
- [x] 1.2 Add migration rules for existing alpha candidate, report, plan, handoff, and triage records.
- [x] 1.3 Add schema validation fixtures for current state and migrated state.
- [x] 1.4 Document privacy implications for every generated record type.
- [x] 1.5 PR checkpoint: merge only after PR-01 has passing CI and migration fixtures proving current alpha records still load.

## 2. Health, Status, and Diagnostics

- [x] 2.1 Add `deepclean doctor --json` with environment, config, state, git, analyzer, provider, and privacy diagnostics.
- [x] 2.2 Add `deepclean status --json` with latest run, queue counts, artifact counts, stale locks, and pending revalidation.
- [x] 2.3 Add structured diagnostic codes and predictable exit behavior for health and status commands.
- [x] 2.4 Add docs for interpreting health/status output.
- [x] 2.5 PR checkpoint: merge only after PR-02 demonstrates `doctor --json` and `status --json` on a clean repo, dirty repo, and repo with existing `.deepclean/` state.

## 3. Stable Identity and Lifecycle

- [x] 3.1 Implement candidate signature generation and durable finding IDs.
- [x] 3.2 Link new observations to existing findings across full and incremental scans.
- [x] 3.3 Persist append-only lifecycle events for creation, observation, triage, suppression, stale, fixed, superseded, and verification transitions.
- [x] 3.4 Add `deepclean history <finding-id> --json`.
- [x] 3.5 Add tests for line drift, file rename tolerance, and false-merge prevention.
- [x] 3.6 PR checkpoint: merge only after PR-03 proves stable identity across at least two repeated scans and preserves old display-ID lookup.

## 4. Revalidation

- [x] 4.1 Add `deepclean revalidate <id|theme|all> --json`.
- [x] 4.2 Recollect minimum required evidence for the target finding or theme.
- [x] 4.3 Classify outcomes as unchanged, changed, fixed, stale, superseded, or inconclusive.
- [x] 4.4 Persist revalidation records and lifecycle events.
- [x] 4.5 Add report badges and filters for revalidation state.
- [x] 4.6 PR checkpoint: merge only after PR-04 includes fixtures for unchanged, changed, fixed, stale, superseded, and inconclusive outcomes.

## 5. Incremental Scans

- [x] 5.1 Add `scan --since <ref>`, `--merge-base <ref>`, `--include-dirty`, `--paths`, `--categories`, `--reviewers`, `--only-existing`, and `--new-only`.
- [x] 5.2 Restrict evidence collection to changed scopes while preserving enough context for ranking.
- [x] 5.3 Record incremental scope and baseline in run metadata.
- [x] 5.4 Add tests for clean branch, dirty working tree, path-filtered, and baseline-missing scenarios.
- [x] 5.5 PR checkpoint: merge only after PR-05 dogfoods an incremental scan against a branch with committed and dirty changes.

## 6. CI Mode and Policy Gates

- [x] 6.1 Add `deepclean ci --json` as a non-interactive command.
- [x] 6.2 Support policy flags for max priority counts, new finding counts, category gates, stale finding gates, and minimum confidence.
- [x] 6.3 Emit JSON, Markdown summary, and optional SARIF output.
- [x] 6.4 Implement baseline-aware failures so old accepted debt can be reported without failing the build.
- [x] 6.5 Add CI examples for GitHub Actions.
- [x] 6.6 PR checkpoint: merge only after PR-06 proves success, policy failure, and provider-required failure exit paths.

## 7. Reporting, Query, and Filters

- [x] 7.1 Add `deepclean list` / `deepclean findings` with filters for status, priority, category, risk, source, theme, path, age, owner, lifecycle state, and revalidation state.
- [x] 7.2 Add report filters and JSON fields using the same query model.
- [x] 7.3 Add baseline comparison output for latest run versus prior run/ref.
- [x] 7.4 Add compact queue exports for agents.
- [x] 7.5 Add docs for common query recipes.
- [x] 7.6 PR checkpoint: merge only after PR-07 proves the same filter semantics across report JSON, list/findings JSON, next, and queue export.

## 8. Locks and Concurrency

- [x] 8.1 Add writer locks around scan, report, plan, handoff, prune, revalidate, and fix operations.
- [x] 8.2 Include owner, PID, command, state path, and timestamp in lock records.
- [x] 8.3 Detect stale locks and provide explicit recovery.
- [x] 8.4 Add contention tests and interrupted-run tests.
- [x] 8.5 PR checkpoint: merge only after PR-08 proves two concurrent writers cannot corrupt `.deepclean/` state.

## 9. Retention, Prune, Scrub, and Export

- [x] 9.1 Add `deepclean prune --dry-run` with retention by runs, reports, plans, handoffs, evidence, and age.
- [x] 9.2 Preserve records needed by retained findings and lifecycle history.
- [x] 9.3 Add `deepclean scrub` or export mode for source-safe sharing.
- [x] 9.4 Persist retention manifests for dry-run and applied prune operations.
- [x] 9.5 Add tests to prevent deleting config, latest artifacts, active locks, or referenced evidence.
- [x] 9.6 PR checkpoint: merge only after PR-09 proves dry-run/apply parity and confirms source-safe export omits excerpts, prompts, and sensitive local paths.

## 10. Provider and Runtime Controls

- [x] 10.1 Add config and CLI controls for provider, model, effort, timeout, retries, rpm, concurrency, token budget, excerpt budget, offline mode, and privacy mode.
- [x] 10.2 Persist provider runtime metadata in run and synthesis records.
- [x] 10.3 Add timeout, retry, rate-limit, and provider-unavailable diagnostics.
- [x] 10.4 Update synthesis docs to recommend model-backed review for serious cleanup while preserving local-only operation.
- [x] 10.5 PR checkpoint: merge only after PR-10 proves offline/local-only mode never invokes providers and provider failures leave durable diagnostics.

## 11. Guarded Fix Execution

- [x] 11.1 Add a design-gated `deepclean fix <finding-id>` flow behind explicit opt-in.
- [x] 11.2 Require a current plan and current revalidation before applying a fix.
- [x] 11.3 Refuse broad, stale, ambiguous, or low-confidence findings.
- [x] 11.4 Capture patch preview, changed files, verification commands, and fix attempt state.
- [x] 11.5 Persist verification results and lifecycle transitions.
- [x] 11.6 Ensure fix never pushes, opens PRs, publishes, or performs external actions.
- [x] 11.7 PR checkpoint: merge only after PR-11 proves dry-run preview, applied local patch, verification pass/fail capture, dirty-tree refusal, and no external side effects.

## 12. Verification and Dogfood

- [x] 12.1 Run typecheck, tests, build, package smoke, release check, and OpenSpec validation.
- [x] 12.2 Dogfood full scan, synthesized report, revalidation, prune dry-run, and CI mode on Deepclean.
- [x] 12.3 Dogfood on one larger private repo and save only a source-safe scorecard.
- [x] 12.4 Update public docs, changelog, troubleshooting, and release notes.
- [x] 12.5 PR checkpoint: merge only after PR-12 records final dogfood evidence and leaves the full OpenSpec change ready to archive.
