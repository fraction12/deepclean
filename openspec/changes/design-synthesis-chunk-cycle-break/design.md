# Synthesis Chunk Cycle Break Design

## Context

Current cycle:

```text
src/synthesis-chunks.ts -> src/synthesis-chunk-areas.ts -> src/synthesis-chunks.ts
```

The implementation responsibilities are already mostly separated:

- `src/synthesis-chunks.ts` owns the public `planSynthesisChunks` entrypoint, whole-repo fallback, quality-gate chunking, and chunk-size decisions.
- `src/synthesis-chunk-areas.ts` owns area grouping and area-group splitting.

The remaining cycle exists because `SynthesisChunk` and `SynthesisPlanningMode` are declared in `src/synthesis-chunks.ts`, even though `SynthesisChunk` is also needed by the lower-level area planner.

## Decision

Introduce a leaf contract module in a follow-up implementation PR:

```text
src/synthesis-chunk-types.ts
```

That module should own shared chunk-planning contracts only:

- `SynthesisChunk`
- `SynthesisPlanningMode`

Then:

- `src/synthesis-chunks.ts` imports those contracts from the leaf module.
- `src/synthesis-chunk-areas.ts` imports those contracts from the leaf module.
- `src/synthesis.ts` and `src/cli.ts` import `SynthesisPlanningMode` from the leaf module rather than the planning implementation module.
- No planning implementation imports from the area planner back through the public entrypoint.

## Rejected Alternatives

- Keep the type in `src/synthesis-chunks.ts` and suppress the cycle. The graph signal is useful here because it points at a real ownership ambiguity.
- Move area planning back into `src/synthesis-chunks.ts`. That would undo the previous extraction and re-grow the module.
- Move `planSynthesisChunks` into the area module. Quality-gate and whole-repo planning are broader orchestration concerns and should remain in the public planning module.

## Follow-Up Slice

The implementation PR should:

1. Add `src/synthesis-chunk-types.ts`.
2. Move only `SynthesisChunk` and `SynthesisPlanningMode` there.
3. Update imports in `src/cli.ts`, `src/synthesis.ts`, `src/synthesis-chunks.ts`, `src/synthesis-chunk-areas.ts`, and tests if needed.
4. Run `npx vitest run src/synthesis-chunks.test.ts`, `npm run ci`, `npm run spec:validate`, and `node dist/cli.js revalidate candidate-015 --json`.
