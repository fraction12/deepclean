# Beta Fix Safety Hardening

## Why

Deepclean should not become "Codex auto-fixes everything." Beta fix execution must be one bounded candidate, one owned file scope, one verification path, and no external side effects.

This change hardens the safety rails around applying a local patch attempt.

## What Changes

- Require clean worktree checks before applied fixes.
- Require branch isolation or explicit local-only mode for mutation workflows.
- Enforce candidate-owned file scope before and after patching.
- Require verification commands for applied fixes.
- Persist before/after diff metadata, changed files, worker output, and scope diagnostics.
- Refuse broad, stale, low-confidence, ambiguous, or unplanned candidates.
- Keep push, PR creation, publishing, and external actions out of fix execution.

## Non-Goals

- No revalidation classification logic beyond invoking the existing revalidation gate.
- No multi-candidate batching.
- No automatic branch push or PR creation.
- No provider-specific patch worker optimization.

## Success Bar

An applied fix either leaves a verified, in-scope local patch attempt record or refuses with a clear reason. It never quietly edits outside the candidate scope and never performs external actions.

## Capabilities

### New Capabilities

- `fix-execution`: safety gates for one-candidate patch attempts.

### Modified Capabilities

- `project-state`: fix attempt, diff, verification, and scope diagnostics.
- `agent-first-cli`: strict `fix` command behavior and refusal codes.

## Impact

- Fix CLI options and JSON contracts.
- Scope enforcement and dirty-worktree checks.
- Verification command execution.
- Tests for out-of-scope edits, dirty worktrees, failed verification, and no external side effects.
