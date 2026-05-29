# Beta Docs Onboarding

## Why

Beta is not just features. A serious developer should be able to install Deepclean, run a scan, understand the report/status, try one safe fix path, recover from common failures, and know what data is written or sent without us explaining it.

This change creates the beta onboarding and recovery documentation.

## What Changes

- Add beta quickstart from install to first report.
- Add status/report reading guide.
- Add one-candidate safe workflow guide.
- Add failure recovery docs for provider failure, invalid state, dirty worktree, stale artifacts, stale locks, failed verification, and inconclusive revalidation.
- Add privacy and generated artifact guidance.
- Add beta limitations and support artifact instructions.

## Non-Goals

- No marketing landing page changes unless needed to link docs.
- No release publish automation.
- No new runtime behavior except help text and docs links.

## Success Bar

A new user can install Deepclean, run the core workflow, interpret the output, and recover from common blocked states using only public docs and CLI help.

## Capabilities

### Modified Capabilities

- `release-readiness`: beta docs gate.
- `agent-first-cli`: help text and command examples.
- `reporting-and-handoff`: docs for reading reports, status, plans, handoffs, and proof.

## Impact

- README, docs, CLI help, troubleshooting, privacy docs, generated artifact docs, and beta release checklist.
