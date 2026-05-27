# deepclean

Clawpatch-style cleanup reports for working-but-sloppy codebases.

`deepclean` is intended to help after a few days of AI-assisted coding: the app works, but the codebase needs architecture tightening, duplication removal, complexity reduction, better seams, stronger tests, and clearer domain language.

## Status

Public-alpha ready local CLI. Product planning lives in `openspec/`.

## Install

```bash
npm install -g @fraction12/deepclean
deepclean --version
```

From a fresh repo:

```bash
deepclean init
deepclean scan --json
deepclean report
deepclean next
deepclean plan candidate-001
```

With local Codex synthesis:

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

## Intended Flow

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

## Principles

- Report first; no source mutation in the MVP.
- Structured local evidence before model review.
- Durable state under `.deepclean/`.
- Local code stays local unless the user explicitly enables researched context.
- Architecture review is one reviewer, not the whole product.

## Agent UX

All core commands support `--json` for machine-readable output.

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

## Codex Synthesis

`deepclean scan --synthesize` runs the local `codex` CLI in read-only mode over the collected evidence bundle. The model is asked to return strict JSON, and candidates without valid evidence IDs are rejected.

Synthesis uses a built-in reviewer pack rather than whatever agent skills happen to be installed locally. That keeps runs reproducible. The current pack covers architecture deepening, deep module discipline, conceptual duplication, dependency graph blast radius, testability, feedback loop discipline, domain language drift, agent-ready cleanup slices, AI-slop patterns, and a critic pass that rejects weak one-metric findings.

The reviewer pack is informed by a vendored MIT-licensed snapshot of Matt Pocock's engineering skills. Deepclean uses those skills as reference material and distills the useful principles into stable built-in rubrics instead of loading the full upstream skill text dynamically on every run.

Reviewer packs can be configured in `.deepclean/config.json`:

```json
{
  "reviewers": {
    "enabled": ["architecture-deepening", "testability", "critic-pass"],
    "customPaths": ["./deepclean-reviewers/security.md"]
  }
}
```

Before prompting Codex, Deepclean also maps evidence and existing local candidates into bounded cleanup surfaces. This is the Clawpatch-inspired part: the model reviews mapped repo areas and graph-connected themes rather than a loose pile of metrics.

Source samples are redacted from the synthesis prompt by default. Use `--allow-source-in-model` only when the target repository and provider configuration make that acceptable.

See [Reviewer References](docs/reviewer-references.md), [Privacy And Trust](docs/privacy-and-trust.md), and [Troubleshooting](docs/troubleshooting.md) before using synthesis on private repos.

## Themes And Plans

`deepclean cluster` groups related candidates into cleanup themes using shared files, shared evidence, module areas, title language, and the local import graph. Themes are persisted under `.deepclean/clusters/` and use stable `theme-001` style IDs for agent workflows. Individual cleanup candidates use `candidate-001` style IDs. Broad themes are split where possible and marked `too-broad` when they should not be handed to an agent as a single plan.

`deepclean plan <candidate-or-theme-id>` writes a Codex-ready cleanup plan under `.deepclean/plans/`. Use theme plans when the report points at a larger cleanup area such as a tangled Next.js app area or a backend service boundary; use candidate plans for narrow local cleanup.

Deepclean currently collects TypeScript, JavaScript, and Python source evidence. The local graph supports TS/JS relative imports and Python module imports, with cache/build/output directories excluded by default.
For TS/JS projects using NodeNext-style source imports, Deepclean resolves emitted `.js` specifiers back to local `.ts`, `.tsx`, `.mts`, and `.cts` files so the graph maps source boundaries instead of falsely reporting an empty graph.

## Evidence Engines

Deepclean runs local evidence first and model synthesis second. The built-in layer includes:

- file metrics
- normalized line-window duplication
- source/import graph summaries
- TypeScript/JavaScript function and wrapper structure
- Python import graph support
- git churn signals
- nearby test discovery
- SARIF ingestion from Semgrep or similar tools
- optional Semgrep SARIF orchestration when configured
- optional `jscpd` duplicate ingestion when configured

To use external analyzer evidence:

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

Publishing is handled by GitHub Actions. See [Release](docs/release.md).
