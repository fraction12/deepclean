# Troubleshooting

## Health And Status

Use `deepclean doctor --json` when checking whether Deepclean is ready to run in a repository. It reports package version, state initialization, config validity, missing state directories, git availability, dirty working tree state, provider availability, privacy settings, and detected project surfaces.

Use `deepclean status --json` when checking what Deepclean already knows about a repository. It is read-only and reports the latest run/report, open/active/blocked/stale queue counts, active items, blocked items, stale artifacts, recent progress events, latest artifact paths, active locks, pending revalidation count, the recommended next command, and git dirty state.

Important diagnostic codes:

- `config_missing`: `.deepclean/config.json` does not exist. Run `deepclean init` when the repository should use Deepclean state.
- `config_invalid`: config exists but does not match the current schema. Inspect `.deepclean/config.json` before running scans.
- `state_dirs_missing`: `.deepclean/` exists but one or more expected state directories are missing. Run `deepclean init` to recreate the directory skeleton.
- `git_unavailable`: the target directory is not a git repository or git could not run there.
- `provider_unavailable`: synthesis is configured but the provider command could not be executed.
- `lock_contention`: another write command owns `.deepclean/locks/state-writer.json`. Retry after it exits, or use `--wait-lock --lock-timeout-ms <ms>` for queued local commands.
- `no_state`: `.deepclean/` does not exist. Run `deepclean init` when the repository should use Deepclean state.
- `no_runs`: state exists but no scan run exists yet. Run `deepclean scan`.
- `invalid_state`: one or more local state records could not be parsed. Inspect the named `.deepclean/` artifact before trusting queue output.
- `missing_latest_artifacts`: the latest run does not have a current report artifact. Run `deepclean report`.
- `stale_state`: at least one finding or generated artifact needs revalidation or regeneration before work continues.
- `stale_lock`: `status` found a stale lock record. Run `deepclean unlock --stale` before the next write command.
- `stale_locks`: a lock file points to a dead process or has exceeded the stale threshold. Run `deepclean unlock --stale` before the next write command.
- `malformed_provider_output`: provider output was recorded but rejected. Use the synthesis attempt ledger for diagnostics, then rerun with a narrower scope or evidence-only mode.
- `privacy_refused`: the requested scan would send source or metadata in a way the current privacy policy disallows. Use `--evidence-only`, `--offline`, `--local-only`, or `--privacy-mode metadata --excerpt-budget 0`.
- `dirty_worktree`: a guarded mutation command refused to run because source files in scope are dirty. Commit, stash, or pass the documented allow flag only when the dirty files are intentional.
- `verification_failed`: a guarded fix ran but one or more verification commands failed. Treat the candidate as still open until fixed and revalidated.
- `revalidation_inconclusive`: Deepclean could not prove the finding resolved or still holds. Inspect the evidence manually before assigning more work.

For agent handoff, prefer this sequence before choosing work:

```bash
deepclean status --json
deepclean show <candidate-id> --json
deepclean plan <candidate-id> --json
deepclean handoff <candidate-id> --json
```

If `status.data.nextAction.command` recommends `deepclean revalidate all`, `deepclean report`, or regenerating a plan/handoff, do that before handing the candidate to a worker.

## Reading Reports And Status

Use `report` for a ranked narrative and `status` for machine-checkable state. A report `Start Here` item is a recommendation to inspect a candidate, not permission to edit broadly.

Recommended drill-down:

```bash
deepclean status --json
deepclean report
deepclean next --json
deepclean show <candidate-id> --json
deepclean plan <candidate-id> --json
deepclean handoff <candidate-id> --format codex --json
```

When `status` reports stale reports, plans, handoffs, revalidations, or fix attempts, regenerate the named artifact before assigning implementation work. Stale proof is not proof.

## Writer Locks

Deepclean serializes state-writing commands so concurrent runs cannot interleave writes under `.deepclean/`. `scan`, `ci`, `report`, `cluster`, `plan`, `triage`, `handoff`, and `revalidate` acquire a project-local writer lock.

For automation that may overlap, prefer:

```bash
deepclean scan --wait-lock --lock-timeout-ms 30000 --json
```

If a machine was interrupted and `doctor` or `status` reports a stale lock, recover explicitly:

```bash
deepclean unlock --stale --json
```

Active locks are never removed by `unlock --stale`; only stale records are deleted.

## CI Mode

Use `deepclean ci --json` in automation. It runs a non-interactive scan, applies explicit policy gates, persists a CI run record under `.deepclean/ci/`, and exits `0` on pass or `3` on policy failure.

Example GitHub Actions step:

```yaml
- name: Deepclean CI
  run: |
    npx @fraction12/deepclean@alpha ci \
      --since origin/main \
      --include-dirty \
      --max-new-p0 0 \
      --max-new-p1 0 \
      --output .deepclean/ci/summary.md \
      --sarif .deepclean/ci/deepclean.sarif \
      --json
```

Use `--require-synthesis` only in CI environments where the configured provider is installed and authenticated. Pair it with `--evidence-only`, `--offline`, or `--local-only` only when you want Deepclean to fail fast instead of silently running a weaker local-only gate.

## Query Recipes

Use the same filters across `report`, `next`, `list`, and `findings`:

```bash
deepclean list --status open --category architecture --path src --json
deepclean next --priority P1 --risk design-needed --json
deepclean report --baseline-status new --source model-synthesis --json
deepclean findings --theme theme-001 --format codex --json
```

`--format codex` on `list`/`findings` emits compact queue items with finding IDs, evidence IDs, files, constraints, and verification commands for worker handoff.

## Retention And Sharing

Use `prune --dry-run` before deleting generated state:

```bash
deepclean prune --keep-runs 5 --dry-run --json
```

The command persists a retention manifest under `.deepclean/retention/` with planned deletions, retained dependencies, blocked paths, and privacy notes. Running without `--dry-run` applies the same deletion plan and writes an applied manifest. Deepclean never prunes `.deepclean/config.json`, active locks, or latest retained run artifacts.

Use a source-safe export before sharing generated state outside the local machine:

```bash
deepclean export --source-safe --output .deepclean/source-safe.json --json
```

`scrub --json` is the same source-safe export path. It keeps actionable IDs, priorities, categories, evidence IDs, verification commands, and repository-relative paths, but omits source excerpts, provider prompts, absolute state paths, generated handoff prose, and generated plan prose.

Share source-safe exports for support. Do not share raw `.deepclean/` from private repositories unless the recipient is allowed to see repository paths, diagnostics, generated prose, and possible source excerpts.

## Guarded Fix Execution

`deepclean fix` is intentionally gated. It only works on one stable finding or candidate at a time, requires an explicit patch file, requires a current plan, and requires current revalidation.

Preview without modifying source:

```bash
deepclean fix finding-abc123 --patch ./fix.patch --dry-run --json
```

Apply locally only after enabling fix execution in `.deepclean/config.json` and passing the explicit source-mutation flag:

```json
{
  "fixExecution": {
    "enabled": true,
    "maxAttempts": 3,
    "verificationCommands": ["npm test", "npm run typecheck"]
  }
}
```

```bash
deepclean fix finding-abc123 \
  --patch ./fix.patch \
  --apply \
  --allow-source-mutation \
  --json
```

Fix execution never pushes, opens pull requests, publishes packages, or performs external actions. It writes local fix attempt records, patch previews, verification outputs, and lifecycle events under `.deepclean/`.

If fix execution fails:

- `fix_execution_disabled`: enable `fixExecution.enabled` only after reading the plan and choosing one candidate.
- `fix_target_too_broad` or `fix_target_needs_split`: run `deepclean split <candidate-id>` or pick a narrower child.
- `fix_ambiguous`: design-needed work needs a human decision before implementation.
- `fix_scope_failed`: inspect changed files and narrow the patch to the candidate-owned scope.
- `fix_no_changed_files`: the worker did not make a material patch; inspect the attempt artifact before retrying.
- `fix_max_attempts_exhausted`: stop retrying and review the candidate manually.

## Generated Files And Ignored Directories

Deepclean skips generated and dependency-heavy paths by default. Typical excluded paths include dependency directories, build outputs, coverage, temporary directories, and `.deepclean/` itself.

If a generated file appears in a report, either add the path to repository ignore rules or narrow the scan with:

```bash
deepclean scan --paths src,app,packages --json
```

Deepclean records repository-relative paths for source files and may record absolute state paths in local diagnostics. Use `export --source-safe` before sharing artifacts.

## Codex Is Missing

Run:

```bash
codex --version
```

If that fails, install or configure the Codex CLI before using the default synthesized `deepclean scan`. Use `deepclean scan --evidence-only` when you need deterministic local analysis without Codex.

## Codex Auth Fails

If synthesis reports an auth or login warning, re-authenticate Codex in the local environment and rerun:

```bash
deepclean scan --json
```

Deepclean preserves local evidence and local candidates when synthesis fails.

## Provider Runtime Controls

For serious cleanup prioritization, `deepclean scan` runs model-backed synthesis by default. Pass runtime controls when you want to tune that provider call:

```bash
deepclean scan \
  --model gpt-5.4 \
  --timeout 120 \
  --retries 1 \
  --rpm 10 \
  --privacy-mode metadata \
  --json
```

Runtime controls can also live in `.deepclean/config.json` under `reviewSynthesis`: `model`, `effort`, `timeoutMs`, `retries`, `rpm`, `concurrency`, `tokenBudget`, `excerptBudget`, `offline`, and `privacyMode`.

Use `--evidence-only`, `--offline`, or `--local-only` when no provider should run. Deepclean will keep local evidence/candidates, mark synthesis as skipped by policy, and emit `synthesis_skipped_by_policy` when synthesis would otherwise be requested. Legacy `reviewSynthesis.enabled=false` does not disable the default synthesis path; use `reviewSynthesis.offline=true` for config-level local-only operation.

`--privacy-mode metadata` keeps provider prompts metadata-only unless `--allow-source-in-model` is used with a positive `--excerpt-budget`. `--privacy-mode local-only` disables provider execution. `--privacy-mode source-ok` allows source excerpts when the excerpt budget is positive.

## Codex Times Out

Increase `.deepclean/config.json`:

```json
{
  "reviewSynthesis": {
    "timeoutMs": 180000
  }
}
```

Large repos should also tune `candidateCaps` and `clusters` before synthesis.

## Missing Git History

The git-history adapter is skipped when the target directory is not a git repository. The rest of the scan still runs.

## Noisy Reports

Use candidate caps and broad-theme controls:

```json
{
  "candidateCaps": {
    "byKind": {
      "duplicate-cluster": 8
    },
    "byKindAndArea": {
      "large-file": 4
    }
  },
  "clusters": {
    "maxCandidates": 10,
    "maxFiles": 12,
    "splitBroad": true
  }
}
```

Themes marked `too-broad` should be split or triaged before handing work to an agent.

## External Analyzer Evidence

Deepclean can ingest SARIF files from tools such as Semgrep when they are present at configured paths:

```bash
semgrep scan --sarif --output semgrep.sarif
deepclean scan --json
```

Optional `jscpd` evidence is disabled by default because it requires the `jscpd` command locally:

```bash
npm install -g jscpd
```

Then enable it in `.deepclean/config.json`.
