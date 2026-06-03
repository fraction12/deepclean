# Design Synthesis Chunk Cycle Break

## Why

Dogfooding surfaced `candidate-015`, a dependency cycle between `src/synthesis-chunks.ts` and `src/synthesis-chunk-areas.ts`. Inspection shows the cycle is caused by ownership drift after area chunk planning was extracted: the area planner imports the `SynthesisChunk` type from the public planning module, while the public planning module imports the area planner implementation.

The next implementation should be small, but the direction should be explicit first so the cycle is broken by ownership, not by an arbitrary import shuffle.

## What Changes

- Document the desired ownership boundary for synthesis chunk planning types.
- Choose a leaf type module as the future home for shared chunk-planning contracts.
- Stop before source changes so a follow-up PR can break the cycle with one bounded type extraction.

## Non-Goals

- No source-code changes in this PR.
- No changes to synthesis chunk planning behavior.
- No changes to provider prompt construction, chunk budgets, or quality-gate selection.

## Success Bar

OpenSpec records the cycle-breaking decision and validates. A future implementation PR can move only the shared chunk planning types into a leaf module and revalidate `candidate-015`.

## Capabilities

### Modified Capabilities

- `review-synthesis`: synthesis chunk planning has an explicit ownership decision for shared chunk contracts.

## Impact

- OpenSpec design and spec artifacts only.
