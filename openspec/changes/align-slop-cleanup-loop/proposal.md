# Align Slop Cleanup Loop

## Why

DeepClean's north star is simple: find codebase slop, explain it, auto-fix the safe parts, and give humans or agents the evidence to fix the rest. Recent work added valuable machinery around opportunities, campaigns, revalidation, CI gates, and Codex synthesis, but the public records and reports now make users reason about too many internal buckets before they can answer the useful question: "what slop did DeepClean find, and what can be done with it?"

This change keeps the engine and removes conceptual drag. It makes slop type and fixability first-class output fields while preserving existing candidate, opportunity, CI, and synthesis contracts for compatibility.

## What Changes

- Add a stable slop taxonomy for findings/candidates: structure, duplication, complexity, testability, dead-weight, ai-slop, domain-drift, analyzer, and metric-only.
- Add a stable fixability taxonomy: auto-fixable, agent-fixable, human-design-needed, review-only, and noise.
- Derive fixability from the existing readiness, risk, verification, opportunity classification, and CI/review context instead of creating another workflow.
- Make reports and CI/PR review output group work by fixability so users can see safe fixes, agent work, design work, and noise quickly.
- Keep Codex synthesis first-class for higher-level slop synthesis, but require synthesized output to carry or derive slop/fixability labels.
- Keep guarded autofix first-class, but ensure it only targets auto-fixable slop with explicit verification and revalidation.

## Non-Goals

- No website, landing page, brand, or launch copy work.
- No broad rename of `candidate`, `opportunity`, or persisted artifact directories.
- No claim of deep language understanding for every ecosystem.
- No expansion of autofix into broad architecture rewrites.
- No removal of CI/review-pr, Codex synthesis, JSON contracts, or machine-readable artifacts.

## Success Bar

- A fresh report clearly separates auto-fixable slop, agent-fixable slop, human-design-needed work, review-only findings, and noise.
- `deepclean next --json`, `report --json`, and quality gate findings expose fixability without breaking existing fields.
- Guarded fix/work can continue to refuse unsafe targets using the same internal safety checks, now expressed as fixability.
- OpenSpec validation, typecheck, and focused tests pass.

## Capabilities

### Modified Capabilities

- `maintainability-candidates`: candidates must classify slop type and fixability.
- `reporting-and-handoff`: reports and handoffs must surface fixability and slop grouping.
- `review-synthesis`: Codex synthesis must produce or allow derivation of slop/fixability metadata.

### New Capabilities

- `fix-execution`: guarded fix/work may only mutate auto-fixable slop.
- `code-quality-gates`: CI/PR review output must classify findings by actionability.

## Impact

- Candidate/opportunity/quality gate schemas gain optional compatibility-safe fields.
- Opportunity building derives fixability from existing classification logic.
- Report rendering gains a short slop actionability summary before raw queues.
- Tests cover schema parsing, opportunity fixability, and report grouping.
