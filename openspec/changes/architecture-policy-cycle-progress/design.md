# Design

## Architecture Policy

Policy lives in Deepclean config under `architecture`:

- `layers`: named layer records with path globs.
- `rules`: import policy records where `from` is a layer and `allow` is the set of layers it may import.
- `maxCycles`: safety cap for persisted cycle evidence.
- `maxPolicyViolations`: safety cap for persisted boundary evidence.

The first layer whose pattern matches a file owns that file. Unmatched files remain unlayered and are not treated as violations.

## Graph Enrichment

`src/architecture-graph.ts` remains pure. It receives optional policy and can return:

- cycle paths;
- policy violations;
- layer summary counts.

Evidence adapters decide how much of that graph-derived data is persisted.

## Evidence

`code-graph-summary` includes cycle count, policy violation count, and layer summaries.

New evidence kinds:

- `dependency-cycle`: one bounded cycle in the local graph.
- `architecture-boundary-violation`: one import edge that violates a configured layer rule.

Candidates are generated from these evidence records as architecture candidates with fix-ready or split-needed readiness depending on scope.

## Progress

Revalidation progress records already persist metric deltas. Status progress should aggregate recent lifecycle revalidation events and render compact movement such as:

- `dependency-hotspot.incoming 12->8`
- `code-graph-summary.cycleCount 3->1`
- `code-graph-summary.policyViolationCount 5->3`

This is only reporting; PR acceptance rules remain guarded by verification and revalidation.
