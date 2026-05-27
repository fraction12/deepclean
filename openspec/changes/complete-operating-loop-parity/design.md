## Design Principles

1. Evidence before judgment. Every durable finding must be backed by local evidence, source excerpts captured in state, or validated analyzer output.
2. Identity before workflow. A tool cannot revalidate, suppress, or track findings unless the same issue can be recognized across runs.
3. Local by default. `.deepclean/` is the source of truth; external analyzers and providers are adapters, not the system of record.
4. One bounded action at a time. Fix execution, when added, must handle one candidate or theme slice with explicit verification rather than broad repository mutation.
5. CI should compare against a baseline. Existing debt should be visible without making adoption impossible; new or worsened debt should be enforceable.
6. Human-readable artifacts are reports; JSON is the contract. Agents should automate against stable schemas.

## Capability Map

### 1. Health and Operations

Add `doctor` for environment readiness and `status` for current project state.

`doctor` answers whether Deepclean can run well here:

- Node/package version.
- repository root detection.
- config validity.
- state schema validity.
- git availability and dirty state.
- analyzer availability.
- provider availability.
- privacy mode.
- supported language/tooling detection.

`status` answers what Deepclean already knows:

- latest run and report.
- open/stale/fixed/suppressed candidate counts.
- latest synthesis state.
- active locks.
- pending revalidation.
- artifacts available for cleanup.

### 2. Stable Finding Identity

Each candidate receives:

- a display ID scoped to the current run, such as `candidate-014`;
- a stable signature derived from category, normalized title, evidence kinds, primary file anchors, graph neighborhood, and optional analyzer rule IDs;
- a durable finding ID, such as `finding_<hash>`, that follows the same concern across runs.

Signatures must be resilient enough to survive line drift and small edits, but conservative enough not to merge unrelated issues. When confidence is low, Deepclean should create a new finding and link possible predecessors rather than overwriting history.

### 3. Lifecycle and Revalidation

Candidates and themes need append-only lifecycle events:

- created.
- observed again.
- triaged.
- suppressed.
- revalidated unchanged.
- changed.
- fixed.
- stale.
- superseded.
- fix attempted.
- verification passed or failed.

`revalidate` reruns the minimum necessary evidence collection and synthesis checks to decide whether a finding still exists. It must not depend only on whether the display ID exists in the latest run.

### 4. Incremental and CI Use

Incremental scans should support:

- `--since <ref>`.
- `--merge-base <ref>`.
- `--include-dirty`.
- `--paths`.
- `--categories`.
- `--reviewers`.
- `--only-existing`.
- `--new-only`.

CI mode should produce JSON, Markdown, and optional SARIF output. It should fail only according to explicit policy flags. Baseline support is mandatory so teams can adopt Deepclean without first clearing all old debt.

### 5. Report and Query Surface

Reports stay concise by default, but querying must be first class:

- list candidates by lifecycle status.
- filter by priority, risk, category, path, source, owner, theme, and age.
- show history for a finding.
- compare latest run to a baseline.
- export machine-readable queues.

The default report should assume synthesis is enabled for serious use. Local-only mode remains useful for fast/offline scans, but the report should label local-only findings as lower-confidence where appropriate.

### 6. State Hygiene

Deepclean should treat `.deepclean/` as an append-heavy local database with housekeeping:

- state schema versions.
- indexes for latest and stable finding identity.
- lock files with owner, PID, command, and timestamp.
- stale lock recovery.
- retention policy.
- dry-run prune.
- scrub/export commands for sharing.

Generated state may contain source paths, excerpts, prompts, and analyzer summaries, so docs and commands must make privacy behavior explicit.

### 7. Provider and Runtime Controls

Provider execution must be configurable and observable:

- provider and model.
- reasoning/effort where supported.
- timeout.
- retries.
- requests per minute.
- max concurrency.
- token budget.
- excerpt budget.
- offline mode.
- local-only mode.
- privacy mode.

Provider failures should degrade to durable diagnostics, not empty reports or silent success.

### 8. Guarded Fix Execution

Fix execution is a future phase of this full operating loop, not a requirement for the immediate report-only posture. When implemented, it must be conservative:

- explicit command such as `deepclean fix <finding-id>`.
- one candidate or bounded theme slice at a time.
- refused if the working tree is unexpectedly dirty unless explicitly allowed.
- plan generated before patching.
- patch preview available.
- verification commands required or inferred.
- fix attempt and verification events persisted.
- no push, PR, or publish side effects.

## Data Model Notes

Add or extend records for:

- `finding`: stable durable identity across runs.
- `candidate_observation`: one run's observation of a finding.
- `lifecycle_event`: append-only history.
- `revalidation`: evidence and decision for current truth state.
- `ci_run`: policy inputs and gate result.
- `lock`: active state writer.
- `retention_manifest`: prune dry-run and applied deletion details.
- `fix_attempt`: proposed/applied patch, changed files, verification, and outcome.

## Migration Strategy

Existing public-alpha candidates without signatures should be migrated lazily:

1. On state load, detect records without stable signatures.
2. Compute best-effort signatures from available fields.
3. Mark migrated findings with `identityConfidence`.
4. Preserve original display IDs and run IDs.
5. Refuse destructive prune against unmigrated state unless `--force` is provided.

## Verification Strategy

Verification needs more than unit tests:

- state migration fixtures from current alpha records.
- signature stability tests across line drift and small title edits.
- revalidation fixtures for unchanged, fixed, stale, and superseded findings.
- CI policy exit-code tests.
- lock contention tests.
- prune dry-run and applied deletion tests.
- provider timeout/rate-limit diagnostics tests.
- dogfood on Deepclean and one larger private repo with source-safe scorecards.
