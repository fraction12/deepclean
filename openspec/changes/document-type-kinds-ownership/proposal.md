# Document Type Kinds Ownership

## Why

Dogfooding surfaced `candidate-001`, a P1 architecture finding for `src/type-kinds.ts`. The evidence shows a dependency hotspot: the module has 8 incoming local imports and no outgoing local imports. Inspection shows it is a central list of persisted enum-like vocabularies used by the typed record schemas.

That coupling is real, but it is not yet proof that the file should be split. Moving enum arrays without an ownership rule could create churn across persisted-state schemas and make compatibility harder to reason about.

## What Changes

- Record the ownership decision for `src/type-kinds.ts` as the shared persisted-state vocabulary module.
- Define when future enum groups should stay centralized versus move into narrower `*-types.ts` modules.
- Stop before implementation so a later PR can apply the rule to one enum family at a time with compatibility evidence.

## Non-Goals

- No source-code moves in this change.
- No persisted schema or enum value changes.
- No broad split of all type-kind arrays.

## Success Bar

The design decision is explicit, OpenSpec validates, and future cleanup has a bounded rule for deciding whether a `type-kinds.ts` dependency hotspot is intentional shared vocabulary or an extraction candidate.

## Capabilities

### Modified Capabilities

- `project-state`: persisted-state enum vocabulary ownership is documented for compatibility-safe cleanup planning.

## Impact

- OpenSpec design and spec artifacts only.
