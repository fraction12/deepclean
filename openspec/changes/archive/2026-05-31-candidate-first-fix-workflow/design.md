# Design

## Operating Principle

Deepclean should become the harness around one candidate, not the author of unbounded code changes.

The product loop is:

1. Identify one candidate or stable finding.
2. Generate or load a small fix plan.
3. Confirm owned files, expected behavior, non-goals, and verification commands.
4. Invoke the patch worker for one bounded patch.
5. Capture changed files and command output.
6. Revalidate the candidate against current code.
7. Run required verification.
8. Classify the outcome.
9. Emit a PR-ready summary only when the proof is good enough.

## Commands

### `deepclean fix`

`deepclean fix <candidate-or-finding-id>` handles one candidate patch attempt.

Important flags:

- `--apply`: actually modify source files.
- `--dry-run`: generate a plan and patch preview only.
- `--revalidate`: run candidate revalidation after patching.
- `--verification <cmd>`: required for applied fixes unless a current approved plan supplies verification.
- `--allow-files <glob>`: explicit expansion beyond candidate-owned files.
- `--allow-dirty`: proceed with a dirty worktree only when the dirty files are recorded.
- `--json`: canonical machine-readable output.

Default behavior should be conservative. Without `--apply`, the command should not mutate application source.

### `deepclean work`

`deepclean work <candidate-or-finding-id>` is the higher-level workflow for branch and PR preparation.

Important flags:

- `--branch <name>`: create or switch to a candidate-specific branch.
- `--pr`: prepare or open a PR only after local proof passes.
- `--verification <cmd>`: required for PR workflow.
- `--apply`: apply the bounded patch as part of the workflow.
- `--no-pr`: stop after producing the PR-ready summary.

Opening a PR is an external side effect. The command must require explicit `--pr`, passed verification, passed revalidation, and a clean branch state.

## Scope Enforcement

Every fix attempt starts with a write scope derived from the candidate:

- candidate files
- feature-owned files when a feature map exists
- test files attached to the feature or plan
- generated plan-approved support files

The patch worker prompt is not enough. Deepclean must inspect the actual changed files after the worker exits. If files outside the allowed scope changed, the attempt is marked `needs_human` or `failed_scope`, and PR workflow is blocked unless the expansion was explicitly approved.

## Plan Requirements

A fix plan must include:

- candidate or finding ID
- problem statement
- owned files
- allowed context files
- expected behavior after the patch
- non-goals
- verification commands
- why this is safe
- refusal conditions

For architecture candidates, the plan must distinguish:

- full candidate resolution
- partial safe extraction
- investigation-only plan
- human-design-needed case

Deepclean should refuse broad architecture fixes unless it can derive a clean, bounded slice.

## Patch Worker

The first implementation can use a local Codex execution adapter. The adapter contract should be generic enough for other workers later:

- receives a fix plan, evidence packet, allowed write scope, and verification expectations
- edits source only when `--apply` is active
- returns changed files, summary, assumptions, and any failure evidence
- must not commit, push, open PRs, or publish

Deepclean remains responsible for state, scope checking, verification, revalidation, and final classification.

## Revalidation And Verification

Both checks are required for a confident outcome:

- Verification proves the codebase still passes the commands chosen for the patch.
- Revalidation proves the original candidate is gone, changed, or still open.

The ordering after patch should be:

1. changed-file scope check
2. verification command
3. Deepclean revalidation
4. outcome classification

If verification fails, revalidation may still run when useful, but the result cannot be PR-ready.

## Outcome Model

Fix attempts should classify the final state as:

- `resolved`: verification passed and revalidation says the candidate is gone.
- `partially-resolved`: verification passed and revalidation says the candidate improved but remains open or split.
- `still-open`: verification passed but revalidation says the candidate still exists.
- `superseded`: revalidation says the candidate no longer maps cleanly to the current code or was replaced by a different finding.
- `needs_human`: scope, ambiguity, model failure, dirty state, or architecture breadth prevents a safe automated conclusion.

Implementation may also store lower-level attempt states such as `planned`, `patch_failed`, `verification_failed`, or `failed_scope`, but the user-facing result should map to the outcome model above.

## PR-Ready Summary

A PR-ready summary is allowed only when:

- the attempt targeted one candidate or one approved slice
- all changed files are in scope
- verification passed
- revalidation passed with `resolved` or an explicitly acceptable `partially-resolved`
- the summary includes before/after evidence and remaining risk

The summary should include:

- candidate ID and title
- branch name when applicable
- changed files
- expected behavior
- verification commands and results
- revalidation outcome
- why this is safe
- remaining work or follow-up candidates

## Retry Policy

Deepclean may retry once when:

- the first patch failed verification
- failure output is available
- changed files remained inside scope
- the candidate is not broad or ambiguous

The retry must receive the failure evidence. A second failure becomes `needs_human`.

## Privacy And External Actions

Patch execution stays local unless the configured provider policy explicitly allows source excerpts. PR creation is an external action and must remain behind explicit `--pr` plus successful local gates.
