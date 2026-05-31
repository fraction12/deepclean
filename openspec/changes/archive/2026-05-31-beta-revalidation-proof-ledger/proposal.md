# Beta Revalidation Proof Ledger

## Why

Verification proves tests passed. Revalidation proves whether the original Deepclean candidate is actually gone, changed, partially addressed, still open, superseded, or needs human review. Beta needs both, recorded durably.

This change adds a proof ledger around revalidation outcomes and fix results.

## What Changes

- Add `deepclean revalidate <id|theme|all>` with structured outcomes.
- Recollect the minimum evidence needed for the target finding.
- Persist revalidation records with evidence, decision, confidence, and rationale.
- Link verification results to revalidation outcomes.
- Add outcome states: resolved, partially-resolved, still-open, superseded, stale, inconclusive, and needs-human.
- Surface proof status in report, status, show, and handoff output.

## Non-Goals

- No patch application in this change.
- No CI policy gates.
- No broad redesign of the synthesis reviewer pack.

## Success Bar

After a fix or source change, an agent can run `deepclean revalidate finding_<id> --json` and get a durable answer explaining whether the original finding is resolved, partially resolved, still open, superseded, or inconclusive, with evidence references.

## Capabilities

### Modified Capabilities

- `agent-first-cli`: revalidation command.
- `project-state`: proof ledger and lifecycle events.
- `evidence-engine-ingestion`: revalidation evidence bundles.
- `reporting-and-handoff`: proof status in queues and handoffs.

## Impact

- Revalidation CLI and JSON output.
- Evidence refresh logic.
- Proof ledger state records.
- Report/status/show/handoff freshness rules.
