## Why

Deepclean's best artifacts come from evidence-grounded Codex synthesis, but the current CLI makes that higher-quality path opt-in. Agents running Deepclean on repos or PRs should get the full review workflow by default while still having an explicit deterministic-only escape hatch.

## What Changes

- Make scan-style workflows request Codex synthesis by default after local evidence collection.
- Keep deterministic-only analysis available through explicit local/evidence-only flags.
- Preserve metadata-only privacy defaults: source excerpts still require explicit opt-in.
- Keep provider failures durable and inspectable instead of discarding local evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-synthesis`: Default scan behavior changes from opt-in synthesis to evidence-first synthesis by default with explicit evidence-only opt-out.
- `agent-first-cli`: CLI help, diagnostics, and CI scan behavior reflect synthesis as the default agent path while preserving explicit local-only operation.

## Impact

- CLI scan and CI command behavior.
- Default configuration.
- Tests covering scan defaults, local-only escape hatches, and CI synthesis policy.
- README, troubleshooting, and privacy/trust docs.
