# Beta Status Progress Surface

## Why

Beta users need `deepclean status` to answer the practical question: what happened, what advanced, what stalled, and what should the next agent do? Reports explain findings; status should explain the cleanup campaign.

This change makes progress a first-class surface built from existing run, lifecycle, split, revalidation, and fix-attempt records.

## What Changes

- Expand `deepclean status` into a lifecycle-aware project summary.
- Add progress events derived from scans, reports, splits, plans, handoffs, fix attempts, verification, and revalidation.
- Add active, blocked, stale, resolved, and next-action sections.
- Add artifact freshness checks for reports, plans, handoffs, and fix attempts.
- Add `--json` output suitable for agents and compact human output for terminals.

## Non-Goals

- No source mutation.
- No new fix execution behavior.
- No CI policy enforcement.
- No separate remote dashboard.

## Success Bar

After this change, a new agent can run `deepclean status --json` in a repo with existing `.deepclean/` state and know the latest run, the active queue, blocked candidates, resolved work, stale artifacts, and the recommended next command.

## Capabilities

### Modified Capabilities

- `agent-first-cli`: lifecycle-aware `status`.
- `reporting-and-handoff`: progress summaries and artifact freshness.
- `project-state`: progress events derived from durable state.

## Impact

- CLI output contracts.
- State readers and latest-artifact indexes.
- Docs for interpreting status output.
- Tests for empty state, stale state, active work, blocked work, and resolved work.
