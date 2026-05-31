# Beta Dogfood Stability

## Why

Beta means Deepclean survives real repositories without handholding. It must run on Deepclean, LightningITB, and several other repos while handling stale artifacts, generated files, malformed provider output, timeouts, dirty worktrees, and partial state.

This change defines the dogfood and hardening pass that decides whether beta is honest.

## What Changes

- Add a beta dogfood matrix across multiple repositories.
- Add source-safe dogfood scorecards.
- Add resilience tests for stale artifacts, malformed provider output, timeout recovery, generated-file noise, duplicate IDs, and partial writes.
- Add release gates that block beta if the matrix fails.
- Add structured diagnostics for dogfood failures.

## Non-Goals

- No new product feature unless dogfood exposes a required stability fix.
- No private source excerpts in committed artifacts.
- No public beta release automation.

## Success Bar

Deepclean can run the core beta workflow on the dogfood matrix and leave each repo understandable, with source-safe scorecards proving what passed, what failed, and what remains risky.

## Capabilities

### Modified Capabilities

- `release-readiness`: beta dogfood matrix and gates.
- `project-state`: resilience around partial/stale state.
- `agent-first-cli`: predictable diagnostics for failure modes.

## Impact

- Dogfood scripts or documented commands.
- Source-safe scorecard artifacts.
- Fixture repos or synthetic state fixtures.
- Release checklist updates.
