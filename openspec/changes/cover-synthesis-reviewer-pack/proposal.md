# Cover Synthesis Reviewer Pack

## Why

Dogfooding surfaced `candidate-031`, a testability finding for `src/synthesis-reviewers.ts`. The module owns reviewer pack selection, custom reviewer loading, version mapping, and diagnostics for missing configured reviewers. Those behaviors affect synthesis provenance and failure visibility, but there is no nearby test file to pin them before future refactors.

## What Changes

- Add nearby tests for built-in reviewer filtering, unknown reviewer diagnostics, custom reviewer loading, missing custom reviewer diagnostics, and rubric version mapping.
- Preserve existing runtime behavior.

## Non-Goals

- No changes to reviewer rubric content.
- No changes to config shape or synthesis provider behavior.
- No broad synthesis module refactor.

## Success Bar

`src/synthesis-reviewers.ts` has focused nearby tests that exercise its exported behavior, and DeepClean revalidation resolves the test-gap finding.

## Capabilities

### Modified Capabilities

- `review-synthesis`: reviewer pack resolution has nearby regression coverage for built-in and custom reviewer selection behavior.

## Impact

- New `src/synthesis-reviewers.test.ts`
