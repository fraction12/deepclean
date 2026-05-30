# Beta Onboarding

This guide takes a repository from a clean install to a source-safe support artifact. The safe path is read-only first: inspect state, scan, read the queue, generate a plan or handoff, then decide whether one guarded local fix is appropriate.

Deepclean is not an autonomous cleanup bot. It does not edit source during `doctor`, `scan`, `status`, `report`, `next`, `show`, `plan`, `handoff`, `revalidate`, `prune --dry-run`, `scrub`, or `export --source-safe`.

## Install Or Update

```bash
npm install -g @fraction12/deepclean
deepclean --version
```

To update an existing install:

```bash
npm install -g @fraction12/deepclean
deepclean --version
deepclean doctor
```

`deepclean doctor` checks the installed package against the npm `latest` channel and emits `package_update_available` when a newer beta exists. Use `deepclean doctor --no-update-check`, `--offline`, or `--local-only` when the run must avoid npm network access.

For one-off runs without a global install:

```bash
npx @fraction12/deepclean@latest doctor
```

## First Read-Only Run

Run this sequence from the target repository root:

```bash
deepclean doctor
deepclean init
deepclean scan
deepclean status
deepclean report
deepclean next
```

Use source-safe local analysis when provider execution is not allowed:

```bash
deepclean scan --evidence-only --json
deepclean report
```

Use metadata-only synthesis when the configured provider is approved but source snippets should stay out of the prompt:

```bash
deepclean scan --privacy-mode metadata --excerpt-budget 0 --json
```

Add `.deepclean/` to `.gitignore` unless the repository intentionally shares generated reports.

## Core Beta Loop

```bash
deepclean doctor
deepclean scan
deepclean status
deepclean report
deepclean next --json
deepclean show <candidate-id>
deepclean plan <candidate-id>
deepclean handoff <candidate-id> --format codex
```

Use `status` when returning to a repository. It is read-only and tells you whether the latest report, plans, handoffs, fix attempts, revalidations, and locks are current enough to continue.

Use `report` for the ranked narrative. The `Start Here` item is a recommendation to inspect, not an instruction to edit.

Use `next --json` when automation needs the highest-priority current item.

Use `show <id>` before planning. It displays the evidence, files, priority, readiness, lifecycle state, and proof status for one candidate or theme.

Use `plan <id>` for a bounded implementation plan. Plans should name owned files, expected behavior, tests, verification commands, and non-goals.

Use `handoff <id> --format codex` when another agent needs a compact task packet. Handoffs are safer after a fresh `plan` and `revalidate`.

## Reading Readiness

Candidates are not all PR-sized. Treat these fields as stop signs:

- `fix-ready`: likely narrow enough for a guarded one-candidate change.
- `needs-split`: split the parent before implementation.
- `design-needed`: clarify the boundary or desired behavior before coding.
- `too-broad`: do not hand this to an agent as one task.
- low confidence or stale lifecycle state: revalidate or confirm manually first.

When `status` reports stale artifacts, regenerate the named artifact before continuing:

```bash
deepclean report
deepclean plan <candidate-id>
deepclean handoff <candidate-id> --format codex
deepclean revalidate <candidate-id>
```

## Guarded One-Candidate Fix

Fix execution is deliberately local and explicit. It requires one target, a current plan, current revalidation, configured verification, and source mutation approval.

Preview a patch without touching source:

```bash
deepclean fix <candidate-id> --mode guarded --patch ./fix.patch --dry-run --json
```

Apply only after enabling fix execution in `.deepclean/config.json`:

```json
{
  "fixExecution": {
    "enabled": true,
    "verificationCommands": ["npm test", "npm run typecheck"]
  }
}
```

```bash
deepclean fix <candidate-id> \
  --mode guarded \
  --patch ./fix.patch \
  --apply \
  --allow-source-mutation \
  --verification "npm test" \
  --verification "npm run typecheck" \
  --json
```

Repeat `--verification` or `--verification-command` for multi-command proof. Deepclean preserves every explicit verification flag and runs each command before marking the guarded attempt as passing.

For branch-oriented local proof:

```bash
deepclean work <candidate-id> \
  --mode guarded \
  --branch deepclean/<candidate-id> \
  --apply \
  --verification "npm test" \
  --verification "npm run build" \
  --no-pr \
  --json
```

`fix` and `work` never publish packages. They only push or open a PR when the command is explicitly run with the PR path and local proof passes.

## Revalidation And Proof

Revalidation checks whether the original finding still holds after the repository changed:

```bash
deepclean revalidate <candidate-id> --json
deepclean revalidate all --json
```

Common outcomes:

- `resolved` or `fixed`: the finding no longer appears to hold.
- `partially-resolved`: useful progress landed, but the candidate is not done.
- `still-open`: the original issue remains.
- `superseded`: the repository changed enough that a fresh scan is safer.
- `needs_human` or `inconclusive`: do not claim the fix is complete without review.

Proof is strongest when a current revalidation record cites current verification output from the same candidate.

## Source-Safe Support Artifacts

Use source-safe export before sharing generated state:

```bash
deepclean export --source-safe --output .deepclean/source-safe.json --json
```

The export keeps IDs, priorities, categories, diagnostics, verification commands, evidence IDs, and repository-relative paths. It omits source excerpts, provider prompts, provider payloads, absolute state paths, generated handoff prose, and generated plan prose.

Good support bundles include:

- `deepclean doctor --json`
- `deepclean status --json`
- the source-safe export
- the package version
- the command that failed

Do not share raw `.deepclean/` directories from private repositories.

## What Deepclean Will Not Do Automatically

Deepclean will not:

- decide that a recommendation is safe to merge without verification
- edit source during scan/report/status/plan/handoff commands
- push branches, open PRs, publish packages, send emails, or contact external services without an explicit command path
- load private OpenClaw skills or local agent memory from the user's machine
- make broad architecture changes from one vague candidate
- treat stale plans, stale handoffs, failed verification, or inconclusive revalidation as proof

## Common Recovery Commands

```bash
deepclean unlock --stale --json
deepclean status --json
deepclean report
deepclean prune --keep-runs 5 --dry-run --json
deepclean scrub --json
```

See [Troubleshooting](troubleshooting.md) for provider failures, malformed output, privacy refusals, dirty worktrees, stale locks, stale artifacts, failed verification, and inconclusive revalidation.
