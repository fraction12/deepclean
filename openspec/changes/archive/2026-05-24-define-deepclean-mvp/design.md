## Context

Deepclean is being created after studying Clawpatch and comparable analysis systems such as CodeRabbit, Semgrep, CodeQL, Tree-sitter, ast-grep, jscpd, LSP-based tooling, and Sonar-style issue models. The important product lesson is that a useful agent tool cannot be a pile of keyword searches and prose summaries. It needs structured local evidence, stable state, strict schemas, and a queue-like command experience.

The repository currently has a TypeScript CLI scaffold and OpenSpec project. There are no implemented Deepclean capabilities yet. This change defines the MVP contract before implementation.

Primary stakeholders are AI agents using the CLI programmatically, with humans as secondary readers of the same reports. The main use case is a codebase that already works, often after several days of AI-assisted coding, but has maintainability debt that needs investigation before fixes are attempted.

## Goals / Non-Goals

**Goals:**

- Make Deepclean a read-only investigation and reporting tool for the MVP.
- Provide an agent-first CLI modeled on Clawpatch: local state, stable IDs, JSON output, `next`, `show`, `triage`, and explicit handoff/export.
- Build findings from structured local evidence engines instead of regex or keyword-only scans.
- Normalize analyzer output into durable evidence records with provenance.
- Use Codex/model review to synthesize, rank, and explain candidates from evidence bundles.
- Produce reports and handoff packets that another agent can use to implement fixes later.

**Non-Goals:**

- No automatic code modification, patch application, commits, pushes, or PR creation in the MVP.
- No dashboard or hosted service.
- No requirement to support every language in v1.
- No upload of private source code to web search or public services.
- No custom linter clone that competes with ESLint, Semgrep, CodeQL, or SonarQube.
- No guarantee that every candidate is auto-fixable.

## Decisions

### Decision: Report-first MVP, not fix-first MVP

Deepclean SHALL focus on investigation, ranking, and durable handoff. The CLI may reserve command names for future fixing, but the MVP must not mutate repository code.

Rationale: bad cleanup reports create worse downstream fixes. A reliable diagnostic product is more valuable than a broad automated refactorer that users cannot trust.

Alternatives considered:
- Start with `fix`: rejected because maintainability changes are often design-sensitive and need evidence-backed prioritization first.
- Human-only markdown report: rejected because the primary user is an agent that needs stable IDs and machine-readable state.

### Decision: Agent-first command contract

Every core command SHALL be scriptable, resumable, non-interactive by default when requested, and able to emit JSON. Human-readable output remains useful but is not canonical.

Rationale: agents need predictable I/O, exit behavior, and durable state. Clawpatch validates this pattern with project-local state, broad JSON support, `next`, `show`, and triage flows.

Alternatives considered:
- Pretty terminal UX first: rejected because it makes automation harder.
- Single `scan` command that prints everything: rejected because agents need resumable drill-down and triage.

### Decision: Local evidence engines, not homemade word search

Deepclean SHALL collect local evidence through adapters around structured analyzers and code intelligence tools. Regex may be used for file discovery or adapter plumbing, but a candidate cannot be justified by regex-only evidence.

Initial adapter targets:
- duplicate detection via jscpd or equivalent structured output
- TS/JS project intelligence via TypeScript compiler APIs or LSP
- import and dependency graph extraction
- AST or structural parsing via Tree-sitter, ast-grep, or equivalent parser-backed tooling
- git history signals such as churn and co-change
- test discovery and source-to-test proximity
- package/framework detection for context gathering

Rationale: linters, CodeRabbit-style systems, Semgrep, CodeQL, LSP, and parser-backed tools work because they reason over code structure and provenance, not raw text alone.

Alternatives considered:
- Implement in-house regex rules: rejected as brittle and unscalable.
- Shell out to one heavyweight analyzer only: rejected because no single tool covers architecture, duplication, testability, and domain drift.

### Decision: Evidence store before candidate synthesis

Deepclean SHALL persist normalized evidence before and alongside candidate records. Candidates reference evidence IDs rather than embedding untraceable observations.

Rationale: durable evidence makes reports auditable, lets agents drill into facts, and allows re-ranking or re-synthesis without rerunning every analyzer.

Alternatives considered:
- Persist only final findings: rejected because it hides provenance and makes false positives hard to triage.

### Decision: Model synthesis over bounded evidence bundles

Codex/model review SHALL receive structured evidence bundles and selected source excerpts. It must return schema-validated candidate records. The model is the judgment layer, not the only discovery mechanism.

Rationale: maintainability issues often require senior-engineer judgment, but model output is only useful when grounded in evidence and validated into a stable schema.

Alternatives considered:
- Ask Codex to inspect the entire repo directly: rejected because it is expensive, less reproducible, and weaker on provenance.
- Pure static analysis with no model: rejected because architecture and AI-slop cleanup opportunities often need synthesis beyond simple metrics.

### Decision: Private-code safety boundary

Deepclean SHALL keep repository source local unless the user explicitly configures a provider that receives code. Web research, when enabled later, must use dependency names, framework docs, or public best-practice queries rather than uploading private source.

Rationale: this tool will often run on private repositories. The safety boundary must be obvious and boring.

Alternatives considered:
- Allow automatic web enrichment using code snippets: rejected for privacy and agent predictability.

## Risks / Trade-offs

- [Risk] Evidence engines produce noisy data. -> Mitigation: keep evidence and candidate layers separate, attach confidence, and require model synthesis to cite evidence IDs.
- [Risk] Agent users may treat a report as a patch plan even when confidence is low. -> Mitigation: include risk, effort, confidence, and explicit handoff constraints.
- [Risk] Analyzer installation differences make scans flaky. -> Mitigation: adapters must report unavailable tools as diagnostics and continue with partial evidence when safe.
- [Risk] Language support becomes too broad too early. -> Mitigation: start with strong TS/JS support and generic file/test/git evidence; add languages through adapters.
- [Risk] JSON schemas become unstable during early design. -> Mitigation: version state records and report schemas from the first MVP.
- [Risk] Reports become verbose and unusable. -> Mitigation: make `report`, `next`, and `show` separate surfaces with ranked summaries and drill-down records.

## Migration Plan

This is a new product with no existing users. Implementation can be introduced behind the new OpenSpec capabilities in phases:

1. Define schemas and command contract.
2. Implement `init` and state validation.
3. Implement local evidence ingestion with at least one real adapter and diagnostics for unavailable adapters.
4. Implement candidate synthesis and persistence.
5. Implement report, next, show, triage, and handoff/export.
6. Dogfood on non-critical repositories and refine ranking/report shape before adding fix behavior.

Rollback is simple for the MVP: remove `.deepclean/` from target repositories and revert the CLI implementation. No source mutation is allowed by the MVP.

## Open Questions

- Which parser-backed adapter should be the default for v1: Tree-sitter, ast-grep, TypeScript compiler APIs, or a combination?
- Should the first release target only TS/JS repositories or include generic multi-language evidence from day one?
- What exact priority rubric should map evidence into P0/P1/P2/P3?
- Should handoff output be one format with provider labels, or separate formats such as `codex`, `clawpatch-style`, and `markdown`?
- Should web research be excluded entirely from v1 or included as an explicit opt-in docs-only enrichment phase?
