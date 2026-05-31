# Proposal

Whole-repo synthesis can exceed the useful context window for larger repositories. Deepclean should keep the scan whole-repo, but split provider synthesis into bounded packets derived from local evidence, metric hot spots, and the semantic feature map.

## Goals

- Preserve one whole-repo `deepclean scan` output.
- Use local evidence and feature ownership to plan scoped synthesis packets.
- Let each packet fail independently without degrading the full run to metric-only findings.
- Persist chunk metadata in the synthesis ledger so users can audit which scopes were reviewed.

## Non-Goals

- Do not add user-facing manual scoped scan commands for this path.
- Do not change provider output schemas.
- Do not make metric-only findings disappear when synthesis is skipped or unavailable.
