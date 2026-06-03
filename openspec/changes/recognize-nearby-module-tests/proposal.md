# Recognize Nearby Module Tests

## Why

Dogfooding candidate `candidate-030` exposed a false positive: after adding `src/synthesis-chunks.test.ts`, `deepclean revalidate candidate-030` still reported `No nearby test discovered: src/synthesis-chunks.ts`. The test-gap adapter was evaluating a scoped source file without access to full-repo nearby test context.

## What Changes

- Provide evidence adapters with full discovered file context in addition to the scoped files they should analyze.
- Make test discovery match nearby tests from full discovered files while still emitting evidence only for scoped source files.
- Add focused coverage for scoped source scans that have a nearby test outside the scoped file list.

## Non-Goals

- No change to source discovery or configured excludes.
- No change to non-test evidence adapters.
- No broad redesign of revalidation.

## Success Bar

Scoped scan or revalidation of `src/foo.ts` does not emit a test-gap evidence record when `src/foo.test.ts` exists in the repository.

## Capabilities

### Modified Capabilities

- `evidence-engine-ingestion`: scoped test discovery must consider full-repo nearby test context.

## Impact

- Evidence adapter context shape.
- Test-discovery evidence.
- Regression tests.
