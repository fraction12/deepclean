# Design

## Shared Graph

`src/architecture-graph.ts` owns deterministic local import graph construction for TypeScript, JavaScript, and Python source files.

The module exposes:

- graph nodes with `imports` and `importedBy` sets;
- sorted directed edges;
- graph-derived node summaries;
- directory summaries;
- edge-key helpers for clustering and evidence replay.

Evidence remains the persistence boundary. The graph module is pure and does not read from disk.

## Fitness Progress

`src/fitness.ts` compares previous evidence against current evidence for the same stable target and returns the strongest reduction.

Supported first metrics:

- `large-file.lines`
- `large-function.lines`
- `dependency-hotspot.incoming`
- `dependency-hotspot.outgoing`

The progress shape stays compatible with existing revalidation records: `kind`, `metric`, `unit`, `before`, `after`, `delta`, and `evidenceIds`.

## Revalidation Rule

Revalidation may classify a finding as `partially-resolved` when:

- the same finding remains but a supported fitness metric improved; or
- the exact finding is not rediscovered, related evidence remains, and a supported fitness metric improved.

Passed verification still does not imply resolution. Fitness progress is proof of campaign movement, not proof of completion.

## Boundaries

This change deliberately avoids policy-as-code. Layer rules, forbidden imports, and ratcheting thresholds should build on this graph/fitness spine in a later change.
