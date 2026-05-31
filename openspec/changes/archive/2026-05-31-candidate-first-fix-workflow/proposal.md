# Candidate-First Fix Workflow

> Archived 2026-05-31 as superseded by `beta-fix-safety-hardening` and `complete-operating-loop-parity`. Remaining broad-candidate decomposition work continues under `split-broad-candidates`.

## Why

Deepclean is useful today because it identifies maintainability candidates, generates plans, and gives agents enough context to work. The weak point is the manual glue after that: choose a bounded candidate, create a branch, apply a patch, run verification, revalidate the finding, summarize the result, and decide whether it is ready for a PR.

The right next step is not "Codex auto-fixes the repo." That becomes unsafe quickly. The right step is a candidate-first execution harness: Deepclean owns the workflow around one bounded candidate, while Codex or another local patch worker applies one constrained patch.

## What Changes

- Add a candidate-first fix lifecycle from plan generation through patch attempt, revalidation, verification, and PR-ready summary.
- Add `deepclean fix <candidate-or-finding-id>` for one bounded local patch attempt.
- Add `deepclean work <candidate-or-finding-id>` as the higher-level branch and PR-prep workflow.
- Require an explicit verification command for applied fixes and PR workflows unless a current candidate plan contains an approved equivalent.
- Enforce candidate-owned file boundaries by default and require explicit expansion for any out-of-scope file.
- Store before/after evidence, changed files, verification output, and outcome classification in `.deepclean/`.
- Classify outcomes as `resolved`, `partially-resolved`, `still-open`, `superseded`, or `needs_human`.
- Refuse broad architecture candidates unless Deepclean can derive a clean slice or the user asks only for a plan/safe extraction.
- Generate PR-ready summaries only after local verification and Deepclean revalidation have passed.

## Non-Goals

- No repo-wide autonomous cleanup.
- No batching unrelated candidates into one patch.
- No automatic PR creation unless the user explicitly invokes the PR workflow and local verification passes.
- No claim that a broad architecture smell is fully solved unless revalidation proves the original candidate is gone.
- No remote provider source upload beyond the repository's configured privacy model.

## Success Bar

After this change, an agent can run:

```bash
deepclean fix candidate-003 --apply --revalidate --verification "make test"
deepclean work candidate-003 --branch chore/deepclean-candidate-003 --pr
```

Deepclean should then produce a durable answer:

"This candidate was patched inside its owned files, verification passed, revalidation says the finding is resolved, and here is the PR-ready summary."

If that cannot be proven, Deepclean should say exactly why: partial resolution, still open, superseded, verification failed, or needs human review.

## Capabilities

### New Capabilities

- `fix-execution`: candidate-first patch execution, verification, revalidation, outcome classification, and PR-ready handoff.

### Modified Capabilities

- `agent-first-cli`: add fix/work commands and strict non-interactive behavior for required verification and branch/PR options.
- `project-state`: persist fix plans, attempts, before/after evidence, verification runs, outcome decisions, and PR summaries.
- `reporting-and-handoff`: surface fix readiness, safe slices, verification requirements, and PR-ready summaries.

## Impact

- CLI command surface and help output.
- Candidate plan and handoff schemas.
- Fix attempt state records and lifecycle events.
- Revalidation and verification orchestration.
- Tests for scope enforcement, failed verification, partial resolution, dirty worktrees, and PR summary gating.
