# Suppress Switch Mapping Duplication

## Why

Dogfooding the fresh scan surfaced `candidate-001`, a P1 duplicate-cluster finding across `src/cli.ts`, `src/fix-workflow-policy.ts`, `src/opportunities.ts`, and `src/quality-gates.ts`. Inspection showed the evidence is a repeated enum/status switch-mapping shape made only of `case` labels and simple `return` lines. That is weak as duplication evidence because these mappings are distinct domain policies that naturally share switch syntax.

## What Changes

- Teach the line-window duplication adapter to ignore windows made only of switch `case` labels and simple `return` statements.
- Preserve normal duplicate-cluster evidence for executable logic with assignments, calls, conditions, loops, or richer repeated blocks.
- Add focused regression coverage for the switch-mapping false positive.

## Non-Goals

- No replacement of the duplication adapter.
- No change to jscpd/external analyzer ingestion.
- No changes to the mapped domain policies themselves.

## Success Bar

A repeated switch-mapping window across files does not produce duplicate-cluster evidence, while regular repeated executable blocks still do.

## Capabilities

### Modified Capabilities

- `evidence-engine-ingestion`: local duplication evidence filters syntax-only switch mapping windows.

## Impact

- `src/evidence-local.ts`
- New or updated duplication evidence tests
- DeepClean revalidation for the duplicate-cluster finding
