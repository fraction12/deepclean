# deepclean

Local repo structure reports for fast-moving codebases.

`deepclean` scans a repository, gathers local evidence, and writes reports and agent-ready plans under `.deepclean/`. It is built for the point where a project is already working and the next step is clearer boundaries, less duplication, safer refactors, stronger tests, and better sequencing.

Deepclean does not edit your source code.

Website: https://fraction12.github.io/deepclean/

## Status

Public alpha. TypeScript, JavaScript, and Python evidence are supported.

## Install

```bash
npm install -g @fraction12/deepclean
deepclean --version
```

## Quick Start

```bash
deepclean init
deepclean scan --json
deepclean report
deepclean next
deepclean plan candidate-001
```

To include local Codex synthesis:

```bash
deepclean scan --synthesize --json
deepclean report
deepclean plan theme-001
```

Global flags work before or after the command:

```bash
deepclean --root ./some-repo scan --synthesize
deepclean scan --root ./some-repo --synthesize
```

## Workflow

```bash
deepclean init
deepclean scan
deepclean scan --synthesize
deepclean report
deepclean cluster
deepclean plan theme-001 --format codex
deepclean next
deepclean show <candidate-id>
deepclean triage <candidate-id> --status ignored --note "intentional boundary"
deepclean handoff <candidate-id> --format codex
```

## What It Produces

Deepclean writes durable local artifacts under `.deepclean/`:

- `runs/` - scan metadata
- `evidence/` - raw local evidence records
- `candidates/` - cleanup candidates
- `clusters/` - related cleanup themes
- `reports/` - Markdown and JSON reports
- `plans/` - focused implementation plans
- `handoffs/` - agent-ready task packets
- `triage/` - local triage notes

Add `.deepclean/` to `.gitignore` unless the repo deliberately wants to share generated reports.

## JSON And Agent Use

Core commands support `--json` for automation:

```bash
deepclean scan --json
deepclean scan --synthesize --json
deepclean report --json
deepclean cluster --json
deepclean plan theme-001 --json
deepclean next --json
deepclean show candidate-001 --json
deepclean handoff candidate-001 --json
```

Useful global flags:

- `--root <path>`
- `--state-dir <path>`
- `--config <path>`
- `--no-input`
- `--quiet`
- `--debug`

## Local Evidence

Deepclean runs local evidence first and optional model synthesis second. The built-in evidence layer includes:

- file metrics
- normalized line-window duplication
- source/import graph summaries
- TypeScript and JavaScript function structure
- Python import graph support
- git churn signals
- nearby test discovery
- SARIF ingestion from Semgrep or similar tools
- optional Semgrep SARIF orchestration
- optional `jscpd` duplicate ingestion

For TS/JS projects using NodeNext-style source imports, Deepclean resolves emitted `.js` specifiers back to local `.ts`, `.tsx`, `.mts`, and `.cts` files so the graph maps source boundaries instead of emitted-path noise.

## Codex Synthesis

`deepclean scan --synthesize` runs the local `codex` CLI in read-only mode over the collected evidence bundle. The model is asked to return strict JSON, and candidates without valid evidence IDs are rejected.

Synthesis uses a built-in reviewer pack so runs do not depend on arbitrary local agent skills. The current pack looks for architecture boundaries, conceptual duplication, dependency graph risk, testability gaps, domain language drift, agent-sized cleanup slices, and weak findings that should be rejected.

Reviewer packs can be configured in `.deepclean/config.json`:

```json
{
  "reviewers": {
    "enabled": ["architecture-deepening", "testability", "critic-pass"],
    "customPaths": ["./deepclean-reviewers/security.md"]
  }
}
```

Source samples are redacted from the synthesis prompt by default. Use `--allow-source-in-model` only when the target repository and provider configuration make that acceptable.

See [Privacy And Trust](docs/privacy-and-trust.md), [Reviewer References](docs/reviewer-references.md), and [Troubleshooting](docs/troubleshooting.md) before using synthesis on private repos.

## Themes And Plans

`deepclean cluster` groups related candidates into cleanup themes using shared files, shared evidence, module areas, title language, and the local import graph. Themes use stable `theme-001` style IDs. Individual cleanup candidates use `candidate-001` style IDs.

`deepclean plan <candidate-or-theme-id>` writes a focused cleanup plan under `.deepclean/plans/`. Use theme plans for larger cleanup areas and candidate plans for narrow local work.

Broad themes are marked `too-broad` when they should not be handed to an agent as one task.

## External Analyzer Evidence

Deepclean can ingest SARIF and duplicate-detection output:

```json
{
  "enabledAdapters": ["file-metrics", "sarif-ingest", "jscpd", "code-graph"],
  "externalAnalyzers": {
    "semgrep": {
      "enabled": true,
      "command": "semgrep",
      "config": "auto",
      "timeoutMs": 120000,
      "maxFindings": 80
    },
    "jscpd": {
      "enabled": true,
      "command": "jscpd",
      "minTokens": 80,
      "maxFindings": 20
    },
    "sarifPaths": ["semgrep.sarif", ".semgrep/semgrep.sarif"]
  }
}
```

## Release Checks

```bash
npm run ci
npm run spec:validate
npm run release:check
```

The release check builds the package, runs tests, validates OpenSpec locally when available, packs the tarball, and rejects private/local artifacts such as `.deepclean/`, `.codex/`, `node_modules/`, source files, and local reports.

Publishing is handled by GitHub Actions trusted publishing. See [Release](docs/release.md).

## Inspiration

Deepclean's local artifact workflow was inspired by ClawPatch, but Deepclean is a separate maintainability reporting CLI.
