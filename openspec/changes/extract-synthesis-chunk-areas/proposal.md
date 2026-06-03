# Extract Synthesis Chunk Areas

## Why

Dogfooding now points at `candidate-001`: `src/synthesis-chunks.ts` is still a large source file. The module mixes the public synthesis-planning entrypoint with lower-level area grouping, area chunk construction, and path slugging helpers. Those helper responsibilities can be split without changing CLI behavior or synthesis payloads.

## What Changes

- Move area grouping and area chunk construction helpers out of `src/synthesis-chunks.ts`.
- Keep `planSynthesisChunks`, exported types, quality-gate planning, and whole-repository fallback behavior stable.
- Preserve existing synthesis chunk IDs, titles, feature/candidate filtering, and file reference behavior.

## Non-Goals

- No changes to prompt contents beyond existing chunk metadata.
- No changes to provider runtime controls, scan defaults, or quality-gate limits.
- No broader synthesis architecture redesign.

## Success Bar

`src/synthesis-chunks.ts` drops below the large-file evidence threshold while all existing synthesis chunk planning tests continue to pass and `deepclean revalidate candidate-001 --json` no longer rediscovers the large-file finding.

## Capabilities

### Modified Capabilities

- `review-synthesis`: synthesis chunk planning internals are split into a smaller helper module with unchanged public behavior.

## Impact

- `src/synthesis-chunks.ts`
- New helper module for area-based chunk planning internals.
- Synthesis chunk planning tests and DeepClean revalidation.
