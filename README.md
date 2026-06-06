<p align="center">
  <img src="site/assets/cleeby-logo.png" alt="Cleeby, the Deepclean mascot" width="156" />
</p>

<h1 align="center">deepclean</h1>

Local repo structure reports for fast-moving codebases.

<p align="center"><em>Meet Cleeby, Deepclean's little code-cleaning buddy.</em></p>

`deepclean` scans a repository, gathers local evidence, and writes reports and agent-ready plans under `.deepclean/`. It is built for the point where a project is already working and the next step is clearer boundaries, less duplication, safer refactors, stronger tests, and better sequencing.

Deepclean is report-first. Source edits are only available through the explicit guarded fix lane.

Docs: https://deepclean.mintlify.app

## Status

Stable CLI with source-safe machine contracts. TypeScript, JavaScript, and Python evidence are supported.

## Install

```bash
npm install -g @fraction12/deepclean
deepclean --version
```

Update with:

```bash
npm install -g @fraction12/deepclean
deepclean --version
deepclean doctor
```

`deepclean doctor` checks the installed package against the npm `latest` channel and warns when a newer version is available. Use `deepclean doctor --no-update-check`, `--offline`, or `--local-only` when the command must avoid network access.

## Quick Start

```bash
deepclean init
deepclean doctor
deepclean scan
deepclean report
deepclean status
deepclean next
deepclean show candidate-001
deepclean plan candidate-001
deepclean handoff candidate-001 --format codex
```

`deepclean scan` collects local evidence first, then runs Codex synthesis by default. Use evidence-only mode when you only want deterministic local analysis:

```bash
deepclean scan --evidence-only --json
deepclean report
```

Global flags work before or after the command:

```bash
deepclean --root ./some-repo scan
deepclean scan --root ./some-repo --evidence-only
```

Older examples may include `deepclean scan --synthesize`; that flag still works, but it is no longer required. Plain `deepclean scan` is the normal synthesized path. Use `--evidence-only`, `--offline`, or `--local-only` when a run must avoid provider execution.

For the full source-safe flow from install through support artifacts, see [Beta Onboarding](docs/beta-onboarding.md).

## Agent Skill

DeepClean includes a project skill agents can load directly:

- [skills/deepclean/SKILL.md](skills/deepclean/SKILL.md)

Codex-style agents can find it through `AGENTS.md`. Claude Code can find it through `CLAUDE.md`. The skill is also included in the npm package so agents can copy or reference it from an installed DeepClean distribution.

## Workflow

```bash
deepclean init
deepclean map
deepclean scan
deepclean report
deepclean status
deepclean cluster
deepclean plan theme-001 --format codex
deepclean next
deepclean show <candidate-id>
deepclean explain <candidate-or-finding-id>
deepclean triage <candidate-id> --status ignored --note "intentional boundary"
deepclean handoff <candidate-id> --format codex
```

## What It Produces

Deepclean writes durable local artifacts under `.deepclean/`:

- `runs/` - scan metadata
- `features/` - semantic feature/work-unit maps
- `evidence/` - raw local evidence records
- `synthesis/` - provider attempt ledgers, prompt manifests, and candidate validation results
- `candidates/` - cleanup candidates
- `clusters/` - related cleanup themes
- `reports/` - Markdown and JSON reports
- `plans/` - focused implementation plans
- `handoffs/` - agent-ready task packets
- `triage/` - local triage notes
- `lifecycle/` and `revalidations/` - finding history and freshness checks
- `fixes/` - local fix attempt ledgers and verification evidence

Add `.deepclean/` to `.gitignore` unless the repo deliberately wants to share generated reports.

## JSON And Agent Use

Core commands support `--json` for automation:

```bash
deepclean scan --json
deepclean map --json
deepclean scan --evidence-only --json
deepclean status --json
deepclean review-pr --base origin/main --head HEAD --json --state-dir .octocheck/deepclean
deepclean report --json
deepclean cluster --json
deepclean plan theme-001 --json
deepclean next --json
deepclean show candidate-001 --json
deepclean explain candidate-001 --json
deepclean handoff candidate-001 --json
deepclean schemas --json
```

Useful global flags:

- `--root <path>`
- `--state-dir <path>`
- `--config <path>`
- `--no-input`
- `--quiet`
- `--debug`

`deepclean status --json` is the safest first command for a returning agent. It is read-only and reports the latest run/report, active queue, blocked items, stale artifacts, recent progress events, pending revalidation, latest artifact paths, locks, and a recommended next command.

`deepclean review-pr --json` is the stable review-agent entrypoint. It runs source-safe local evidence for a PR diff and emits changed files, related findings, architecture neighborhoods, a risk summary, suggested verification commands, and prompt context. OctoCheck should own GitHub publishing; Deepclean supplies the context.

`deepclean schemas --json` emits the GA-candidate JSON contracts for `review-pr` and the guarded autofix lane.

## Guarded Fix Workflow

Deepclean recommendations are not automatic fixes. The safe implementation loop is:

1. Inspect one candidate with `deepclean show <candidate-id>`.
2. Generate a bounded plan with `deepclean plan <candidate-id>`.
3. Generate an agent handoff with `deepclean handoff <candidate-id> --format codex`.
4. Apply one local patch only through an explicit guarded fix path.
5. Run verification and `deepclean revalidate <candidate-id>` before treating the work as resolved.

`deepclean fix --mode guarded` and `deepclean work --mode guarded` are intentionally gated. They require one target, explicit source mutation, current proof inputs, and verification. They do not publish packages, push branches, or open PRs unless an explicit PR workflow is requested and local proof passes.

For the GA autofix lane:

```bash
deepclean fix <candidate-id> --mode guarded --apply --verification "npm test"
deepclean fix <candidate-id> --mode guarded --apply --branch chore/deepclean-fix --pr --verification "npm test"
```

Only guarded mode is supported. Broad architecture redesign, ambiguous ownership changes, and fix classes Deepclean cannot prove remain outside the GA autofix contract.

Use repeated `--verification` or `--verification-command` flags when one proof command is not enough. Deepclean runs every explicit verification command in order before recording the fix/work attempt as passing.

## Local Evidence

Deepclean runs local evidence first and model synthesis second unless evidence-only or local-only mode is selected. The built-in evidence layer includes:

- semantic feature mapping for package scripts, TS/JS modules/routes/components, Python modules, test suites, and config files
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

`deepclean scan` runs the local `codex` CLI in read-only mode over the collected evidence bundle by default. The model is asked to return strict JSON, and candidates are validated before they are persisted: cited evidence IDs must exist, file paths must be anchored by cited evidence, line ranges must be sane, and optional quotes must match source. Rejected drafts stay in the synthesis attempt ledger as diagnostics rather than becoming open findings.

Use `deepclean explain <candidate-or-finding-id>` to inspect why a candidate exists, which evidence supports it, which validation checks passed, and what fix-readiness guidance was attached.

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

Source samples are redacted from the synthesis prompt by default. Use `--allow-source-in-model` only when the target repository and provider configuration make that acceptable. Use `--evidence-only`, `--offline`, or `--local-only` when no provider should run.

See [Beta Onboarding](docs/beta-onboarding.md), [Privacy And Trust](docs/privacy-and-trust.md), [Reviewer References](docs/reviewer-references.md), and [Troubleshooting](docs/troubleshooting.md) before using synthesis on private repos.

## Themes And Plans

`deepclean cluster` groups related candidates into cleanup themes using shared files, shared evidence, module areas, title language, and the local import graph. Themes use stable `theme-001` style IDs. Individual cleanup candidates use `candidate-001` style IDs.

`deepclean plan <candidate-or-theme-id>` writes a focused cleanup plan under `.deepclean/plans/`. Use theme plans for larger cleanup areas and candidate plans for narrow local work.

Broad themes are marked `too-broad` when they should not be handed to an agent as one task.

Plans and handoffs are shaped as proof-backed PR slices, not smell lists. They call out the symptom, risk, evidence, minimal fix, tests to pin first, verification commands, expected no-op behavior, and non-goals so a future agent has a stop line instead of an invitation to over-refactor.

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
