## 1. Product Spec and State Foundation

- [ ] 1.1 Define stable finding, observation, lifecycle event, revalidation, CI run, lock, retention manifest, and fix attempt schemas.
- [ ] 1.2 Add migration rules for existing alpha candidate, report, plan, handoff, and triage records.
- [ ] 1.3 Add schema validation fixtures for current state and migrated state.
- [ ] 1.4 Document privacy implications for every generated record type.

## 2. Health, Status, and Diagnostics

- [ ] 2.1 Add `deepclean doctor --json` with environment, config, state, git, analyzer, provider, and privacy diagnostics.
- [ ] 2.2 Add `deepclean status --json` with latest run, queue counts, artifact counts, stale locks, and pending revalidation.
- [ ] 2.3 Add structured diagnostic codes and predictable exit behavior for health and status commands.
- [ ] 2.4 Add docs for interpreting health/status output.

## 3. Stable Identity and Lifecycle

- [ ] 3.1 Implement candidate signature generation and durable finding IDs.
- [ ] 3.2 Link new observations to existing findings across full and incremental scans.
- [ ] 3.3 Persist append-only lifecycle events for creation, observation, triage, suppression, stale, fixed, superseded, and verification transitions.
- [ ] 3.4 Add `deepclean history <finding-id> --json`.
- [ ] 3.5 Add tests for line drift, file rename tolerance, and false-merge prevention.

## 4. Revalidation

- [ ] 4.1 Add `deepclean revalidate <id|theme|all> --json`.
- [ ] 4.2 Recollect minimum required evidence for the target finding or theme.
- [ ] 4.3 Classify outcomes as unchanged, changed, fixed, stale, superseded, or inconclusive.
- [ ] 4.4 Persist revalidation records and lifecycle events.
- [ ] 4.5 Add report badges and filters for revalidation state.

## 5. Incremental Scans

- [ ] 5.1 Add `scan --since <ref>`, `--merge-base <ref>`, `--include-dirty`, `--paths`, `--categories`, `--reviewers`, `--only-existing`, and `--new-only`.
- [ ] 5.2 Restrict evidence collection to changed scopes while preserving enough context for ranking.
- [ ] 5.3 Record incremental scope and baseline in run metadata.
- [ ] 5.4 Add tests for clean branch, dirty working tree, path-filtered, and baseline-missing scenarios.

## 6. CI Mode and Policy Gates

- [ ] 6.1 Add `deepclean ci --json` as a non-interactive command.
- [ ] 6.2 Support policy flags for max priority counts, new finding counts, category gates, stale finding gates, and minimum confidence.
- [ ] 6.3 Emit JSON, Markdown summary, and optional SARIF output.
- [ ] 6.4 Implement baseline-aware failures so old accepted debt can be reported without failing the build.
- [ ] 6.5 Add CI examples for GitHub Actions.

## 7. Reporting, Query, and Filters

- [ ] 7.1 Add `deepclean list` / `deepclean findings` with filters for status, priority, category, risk, source, theme, path, age, owner, lifecycle state, and revalidation state.
- [ ] 7.2 Add report filters and JSON fields using the same query model.
- [ ] 7.3 Add baseline comparison output for latest run versus prior run/ref.
- [ ] 7.4 Add compact queue exports for agents.
- [ ] 7.5 Add docs for common query recipes.

## 8. Locks and Concurrency

- [ ] 8.1 Add writer locks around scan, report, plan, handoff, prune, revalidate, and fix operations.
- [ ] 8.2 Include owner, PID, command, state path, and timestamp in lock records.
- [ ] 8.3 Detect stale locks and provide explicit recovery.
- [ ] 8.4 Add contention tests and interrupted-run tests.

## 9. Retention, Prune, Scrub, and Export

- [ ] 9.1 Add `deepclean prune --dry-run` with retention by runs, reports, plans, handoffs, evidence, and age.
- [ ] 9.2 Preserve records needed by retained findings and lifecycle history.
- [ ] 9.3 Add `deepclean scrub` or export mode for source-safe sharing.
- [ ] 9.4 Persist retention manifests for dry-run and applied prune operations.
- [ ] 9.5 Add tests to prevent deleting config, latest artifacts, active locks, or referenced evidence.

## 10. Provider and Runtime Controls

- [ ] 10.1 Add config and CLI controls for provider, model, effort, timeout, retries, rpm, concurrency, token budget, excerpt budget, offline mode, and privacy mode.
- [ ] 10.2 Persist provider runtime metadata in run and synthesis records.
- [ ] 10.3 Add timeout, retry, rate-limit, and provider-unavailable diagnostics.
- [ ] 10.4 Update synthesis docs to recommend model-backed review for serious cleanup while preserving local-only operation.

## 11. Guarded Fix Execution

- [ ] 11.1 Add a design-gated `deepclean fix <finding-id>` flow behind explicit opt-in.
- [ ] 11.2 Require a current plan and current revalidation before applying a fix.
- [ ] 11.3 Refuse broad, stale, ambiguous, or low-confidence findings.
- [ ] 11.4 Capture patch preview, changed files, verification commands, and fix attempt state.
- [ ] 11.5 Persist verification results and lifecycle transitions.
- [ ] 11.6 Ensure fix never pushes, opens PRs, publishes, or performs external actions.

## 12. Verification and Dogfood

- [ ] 12.1 Run typecheck, tests, build, package smoke, release check, and OpenSpec validation.
- [ ] 12.2 Dogfood full scan, synthesized report, revalidation, prune dry-run, and CI mode on Deepclean.
- [ ] 12.3 Dogfood on one larger private repo and save only a source-safe scorecard.
- [ ] 12.4 Update public docs, changelog, troubleshooting, and release notes.
