## Why

AI-assisted projects often reach a working state before the codebase reaches a maintainable state. Deepclean should give agents and humans a trustworthy way to investigate that gap, surface the most important cleanup opportunities, and produce a durable report that another agent can act on later.

The first product should not be an auto-refactorer. It should be a read-only, agent-first investigation tool that turns local code evidence into ranked, explainable maintainability candidates.

## What Changes

- Define Deepclean as a read-only maintainability investigation CLI for working-but-sloppy repositories.
- Introduce a Clawpatch-inspired project workflow: `init`, `scan`, `report`, `next`, `show`, `triage`, and `handoff` / `export`.
- Persist local project state under `.deepclean/`, including runs, evidence, candidates, clusters, reports, triage history, and handoff packets.
- Treat JSON as the canonical interface for agents, with human-readable output as a secondary presentation layer.
- Replace ad hoc regex scanning with structured local evidence engines: parser-backed analysis, dependency graphs, duplication detection, git signals, test discovery, and analyzer output normalization.
- Use Codex/model review as a synthesis layer over structured evidence, not as the only discovery mechanism.
- Generate ranked cleanup candidates with evidence, confidence, impact, effort, risk, suggested direction, verification path, and agent handoff notes.
- Defer code mutation, patching, PR creation, and broad automated fixes until after the report-first MVP proves useful.

## Capabilities

### New Capabilities

- `agent-first-cli`: Scriptable CLI behavior for agents, including stable commands, JSON output, non-interactive execution, local state controls, and predictable exit behavior.
- `project-state`: Project-local state model for config, runs, evidence, candidates, clusters, reports, triage history, and handoff artifacts.
- `evidence-engine-ingestion`: Structured local evidence collection from analyzer adapters and code-intelligence tools without relying on keyword or regex-only findings.
- `maintainability-candidates`: Candidate generation and ranking for architecture, complexity, duplication, testability, dead weight, AI-slop signals, and domain drift.
- `reporting-and-handoff`: Durable reports and agent-ready handoff packets that explain what matters, why it matters, and how a future fixer should proceed.
- `review-synthesis`: Codex/model synthesis over normalized evidence with strict schemas, provenance, and private-code safety constraints.

### Modified Capabilities

- None. This is the first Deepclean capability set.

## Impact

- CLI command surface in `src/cli.ts` and future command modules.
- New `.deepclean/` runtime state directory in scanned repositories.
- New TypeScript schemas for config, runs, evidence, candidates, clusters, reports, triage, and handoff records.
- New adapter interfaces and dependencies for structured local evidence engines such as duplication detection, AST/structural analysis, TypeScript/JS project intelligence, import graphs, git history, and test discovery.
- New provider integration for Codex/model review using strict JSON schemas.
- No code mutation or external publication in the MVP.
