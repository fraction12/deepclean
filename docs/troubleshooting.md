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
