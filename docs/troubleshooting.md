# Troubleshooting

## Health And Status

Use `deepclean doctor --json` when checking whether Deepclean is ready to run in a repository. It reports package version, state initialization, config validity, missing state directories, git availability, dirty working tree state, provider availability, privacy settings, and detected project surfaces.

Use `deepclean status --json` when checking what Deepclean already knows about a repository. It reports the latest run, open/total queue counts, evidence/theme counts, artifact counts, active locks, pending revalidation count, and git dirty state.

Important diagnostic codes:

- `config_missing`: `.deepclean/config.json` does not exist. Run `deepclean init` when the repository should use Deepclean state.
- `config_invalid`: config exists but does not match the current schema. Inspect `.deepclean/config.json` before running scans.
- `state_dirs_missing`: `.deepclean/` exists but one or more expected state directories are missing. Run `deepclean init` to recreate the directory skeleton.
- `git_unavailable`: the target directory is not a git repository or git could not run there.
- `provider_unavailable`: synthesis is configured but the provider command could not be executed.
- `lock_contention`: another write command owns `.deepclean/locks/state-writer.json`. Retry after it exits, or use `--wait-lock --lock-timeout-ms <ms>` for queued local commands.
- `stale_locks`: a lock file points to a dead process or has exceeded the stale threshold. Run `deepclean unlock --stale` before the next write command.

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

Use `--require-synthesis --synthesize` only in CI environments where the configured provider is installed and authenticated. Without `--synthesize`, `--require-synthesis` fails fast rather than silently running a weaker local-only gate.

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

## Codex Is Missing

Run:

```bash
codex --version
```

If that fails, install or configure the Codex CLI before using `deepclean scan --synthesize`. Plain `deepclean scan` still works without Codex.

## Codex Auth Fails

If synthesis reports an auth or login warning, re-authenticate Codex in the local environment and rerun:

```bash
deepclean scan --synthesize --json
```

Deepclean preserves local evidence and local candidates when synthesis fails.

## Provider Runtime Controls

For serious cleanup prioritization, run model-backed synthesis explicitly:

```bash
deepclean scan \
  --synthesize \
  --model gpt-5.4 \
  --timeout 120 \
  --retries 1 \
  --rpm 10 \
  --privacy-mode metadata \
  --json
```

Runtime controls can also live in `.deepclean/config.json` under `reviewSynthesis`: `model`, `effort`, `timeoutMs`, `retries`, `rpm`, `concurrency`, `tokenBudget`, `excerptBudget`, `offline`, and `privacyMode`.

Use `--offline` or `--local-only` when no provider should run. Deepclean will keep local evidence/candidates, mark synthesis as skipped by policy, and emit `synthesis_skipped_by_policy`.

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
