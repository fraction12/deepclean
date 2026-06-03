# Share Synthesis Attempt Fields

## Why

Dogfooding surfaced `candidate-019`, a duplicate-cluster finding between normal synthesis attempts and aggregate chunked synthesis attempts. Both paths manually build the same runtime controls and evidence manifest shape for the synthesis attempt ledger. Keeping those fields duplicated makes future ledger changes easy to apply in one path and miss in the other.

## What Changes

- Extract the shared synthesis attempt runtime and evidence-manifest construction into a small internal helper.
- Use the helper from both single-attempt and aggregate chunked-attempt construction.
- Preserve the persisted synthesis attempt JSON shape.

## Non-Goals

- No changes to synthesis prompting, validation, chunk planning, or provider execution.
- No schema changes for persisted synthesis attempt records.
- No broad synthesis module split.

## Success Bar

The duplicated field construction no longer appears in both files, existing synthesis tests pass, and DeepClean revalidation resolves the duplicate-cluster finding.

## Capabilities

### Modified Capabilities

- `review-synthesis`: synthesis attempt ledger construction shares common internal field builders while preserving record shape.

## Impact

- `src/synthesis-prompt.ts`
- `src/synthesis.ts`
- New or updated synthesis attempt helper/tests if needed
