## 1. CLI Contract And State Foundation

- [x] 1.1 Define TypeScript schemas for config, run, evidence, candidate, cluster, report, triage, diagnostic, and handoff records.
- [x] 1.2 Implement shared CLI options for `--json`, `--plain`, `--no-input`, `--root`, `--state-dir`, `--config`, `--quiet`, and `--debug`.
- [x] 1.3 Implement predictable command result and error envelopes for JSON output.
- [x] 1.4 Implement `.deepclean/` state path resolution and safe directory creation.
- [x] 1.5 Implement `deepclean init` to create or validate project-local config and state directories.
- [x] 1.6 Add unit tests for schema validation, state path resolution, and JSON command envelopes.

## 2. Evidence Engine Framework

- [x] 2.1 Define the evidence adapter interface, adapter diagnostics, and normalized evidence record types.
- [x] 2.2 Implement repository file discovery with default exclusions for dependencies, build output, generated files, vendored code, and configured ignored paths.
- [x] 2.3 Implement scan orchestration that runs enabled adapters, records diagnostics, and persists partial evidence safely.
- [x] 2.4 Implement duplication evidence ingestion using jscpd or an equivalent structured-output adapter.
- [x] 2.5 Implement import/dependency graph evidence for TypeScript and JavaScript projects.
- [x] 2.6 Implement TS/JS project intelligence using TypeScript compiler APIs, LSP, or a documented equivalent.
- [x] 2.7 Implement parser-backed structural evidence using Tree-sitter, ast-grep, or a documented equivalent.
- [x] 2.8 Implement git history evidence for churn and co-change signals.
- [x] 2.9 Implement test discovery evidence and source-to-test proximity signals.
- [x] 2.10 Add fixture repositories and adapter tests proving findings are not regex-only.

## 3. Review Synthesis

- [x] 3.1 Define evidence bundle construction for model review, including graph summaries, selected excerpts, docs/context references, and evidence IDs.
- [x] 3.2 Define strict provider output schemas for synthesized candidates, clusters, and synthesis diagnostics.
- [x] 3.3 Implement the Codex provider adapter for maintainability investigation mode.
- [x] 3.4 Validate provider output before persistence and reject malformed or unsupported candidates.
- [x] 3.5 Persist synthesis provenance including provider, model identifier when available, prompt template version, evidence bundle ID, and run ID.
- [x] 3.6 Add tests for malformed provider output, unsupported candidate rejection, and provider failure after evidence collection.
- [x] 3.7 Add a built-in reviewer pack and cleanup-surface mapping so Codex reviews repo areas through specialist unslop rubrics instead of generic metric summaries.

## 4. Candidate Model And Ranking

- [x] 4.1 Implement candidate creation with category, priority, confidence, impact, effort, risk, file references, evidence references, root cause, suggested direction, and verification path.
- [x] 4.2 Implement candidate categories for architecture, complexity, duplication, testability, dead weight, AI-slop signals, and domain drift.
- [x] 4.3 Implement cluster creation for related candidates across files or concepts.
- [x] 4.4 Implement a documented ranking rubric for report ordering and `next` selection.
- [x] 4.5 Implement safeguards that prevent regex-only or unsupported observations from becoming open candidates.
- [x] 4.6 Add tests for candidate records, cluster records, and ranking output.

## 5. Reporting And Handoff Commands

- [x] 5.1 Implement `deepclean scan` to collect evidence, run synthesis, persist records, and emit JSON or human summaries.
- [x] 5.2 Implement `deepclean report` to generate durable report artifacts from persisted state.
- [x] 5.3 Implement `deepclean next` to return the highest-priority actionable open candidate.
- [x] 5.4 Implement `deepclean show <candidate-id>` to return a full candidate record with supporting evidence and triage state.
- [x] 5.5 Implement `deepclean triage <candidate-id>` with status changes, required notes for non-open statuses, and history entries.
- [x] 5.6 Implement `deepclean handoff <candidate-id>` or `deepclean export <candidate-id>` for Codex-ready task packets.
- [x] 5.7 Add command tests for JSON output, non-interactive behavior, empty queues, missing candidate IDs, and triage history.
- [x] 5.8 Implement `deepclean cluster` and `deepclean plan <candidate-or-cluster-id>` for theme-level cleanup workflows.

## 6. Safety, Privacy, And Agent UX

- [x] 6.1 Enforce MVP read-only behavior for repository source files and allow writes only under `.deepclean/`.
- [x] 6.2 Ensure non-TTY runs avoid spinners, prompts, and ambiguous progress output.
- [x] 6.3 Add privacy settings that prevent private source from being sent to web research or public enrichment flows.
- [x] 6.4 Add explicit diagnostics for unavailable adapters, missing providers, invalid config, and partial scans.
- [x] 6.5 Document state layout, command JSON contracts, exit behavior, and agent handoff usage in README or docs.
- [x] 6.6 Add integration tests that scan a fixture repo without modifying source files.

## 7. Validation And Dogfood

- [x] 7.1 Run `npm run typecheck`, `npm run build`, and the project test suite.
- [x] 7.2 Run `openspec validate --all --no-interactive`.
- [x] 7.3 Verify the MVP has at least three real local evidence adapters before calling it dogfoodable.
- [x] 7.4 Verify the MVP includes import/dependency graph evidence, test discovery evidence, git churn or co-change evidence, and at least one parser-backed structural evidence source.
- [x] 7.5 Dogfood Deepclean against at least two non-critical messy local repositories and save generated reports as review artifacts.
- [x] 7.6 Review dogfood reports for false positives, missing evidence, weak handoff notes, ranking quality, and whether another agent could act without rereading the whole repository.
- [x] 7.7 Update the OpenSpec change if dogfood reveals requirement gaps before implementing fix-oriented commands.
