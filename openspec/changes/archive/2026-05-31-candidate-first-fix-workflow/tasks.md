> Archived 2026-05-31 as superseded. These unchecked tasks are retained as historical planning context, not active work. Continue with `split-broad-candidates` for the remaining decomposition gap.

## 1. CLI And Planning

- [ ] 1.1 Add `deepclean fix <candidate-or-finding-id>` with `--dry-run`, `--apply`, `--revalidate`, `--verification`, `--allow-files`, `--allow-dirty`, and `--json`.
- [ ] 1.2 Add `deepclean work <candidate-or-finding-id>` with `--branch`, `--pr`, `--no-pr`, `--apply`, `--verification`, and `--json`.
- [ ] 1.3 Extend candidate plans with owned files, expected behavior, non-goals, verification commands, refusal conditions, and `whyThisIsSafe`.
- [ ] 1.4 Refuse broad architecture candidates unless a bounded slice or plan-only action is available.

## 2. Fix Attempt State

- [ ] 2.1 Add schemas for fix plans, fix attempts, patch worker runs, verification runs, before/after evidence snapshots, and PR-ready summaries.
- [ ] 2.2 Persist append-only lifecycle events for planned, patched, scope-failed, verification-passed, verification-failed, revalidated, retried, and classified outcomes.
- [ ] 2.3 Add migration-safe state loading so older `.deepclean/` directories without fix records continue to work.

## 3. Patch Worker Harness

- [ ] 3.1 Implement a local Codex patch adapter behind an internal worker interface.
- [ ] 3.2 Pass the worker a bounded plan, evidence packet, allowed write scope, and verification expectations.
- [ ] 3.3 Ensure the worker is instructed not to commit, push, open PRs, publish, or edit outside the allowed scope.
- [ ] 3.4 Capture worker stdout/stderr, changed files, assumptions, and failure evidence.

## 4. Safety Gates

- [ ] 4.1 Enforce clean-worktree checks before applied fixes, with explicit dirty-state recording for `--allow-dirty`.
- [ ] 4.2 Inspect changed files after patching and fail or mark `needs_human` when changes exceed candidate-owned scope.
- [ ] 4.3 Require verification for applied fixes and PR workflows.
- [ ] 4.4 Run revalidation after patching when `--revalidate` or `work --pr` is requested.
- [ ] 4.5 Implement one retry using verification failure evidence, then mark remaining failures `needs_human`.

## 5. Outcomes And PR Prep

- [ ] 5.1 Classify outcomes as `resolved`, `partially-resolved`, `still-open`, `superseded`, or `needs_human`.
- [ ] 5.2 Generate PR-ready summaries only when scope, verification, and revalidation gates pass.
- [ ] 5.3 Block `--pr` when verification fails, revalidation is absent or failing, changed files are out of scope, or the outcome is `still-open` / `needs_human`.
- [ ] 5.4 Record remaining risk and follow-up candidates for partial resolutions.

## 6. Tests And Docs

- [ ] 6.1 Add fixture repos for resolved, partial, still-open, superseded, broad architecture refusal, dirty worktree, and out-of-scope edit scenarios.
- [ ] 6.2 Add CLI JSON contract tests for `fix` and `work`.
- [ ] 6.3 Add docs showing the candidate-first workflow and explaining why Deepclean does not batch unrelated fixes.
- [ ] 6.4 Run `npm run typecheck`, `npm test`, `npm run spec:validate`, and `npm run release:check`.
