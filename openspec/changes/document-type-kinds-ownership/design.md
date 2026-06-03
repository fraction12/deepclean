# Type Kinds Ownership Design

## Context

`src/type-kinds.ts` exports string-literal arrays used by Zod record schemas and derived TypeScript types. Current importers are:

- `src/candidate-types.ts`
- `src/evidence-types.ts`
- `src/finding-types.ts`
- `src/operation-types.ts`
- `src/opportunity-types.ts`
- `src/quality-types.ts`
- `src/reporting-types.ts`
- `src/types.ts`

DeepClean reports this as a dependency hotspot because those modules all import the shared vocabulary. The module has no outgoing local imports, so it is a stable leaf rather than an orchestration module.

## Decision

Keep `src/type-kinds.ts` as the shared persisted-state vocabulary owner for enum-like arrays that are reused across record families, influence compatibility, or describe lifecycle/status concepts shared by multiple schemas.

Move a group out of `type-kinds.ts` only when all of these are true:

1. The values are owned by exactly one record family or bounded subsystem.
2. The destination module can own both the schema and the value vocabulary without creating a cycle.
3. The move preserves exported compatibility through `src/types.ts` or an explicit migration path.
4. The PR proves behavior with typecheck, tests, build, and DeepClean revalidation for the specific target.

## Rejected Alternatives

- Split every array into its nearest `*-types.ts` file now. This would reduce one graph metric but risks churn and compatibility mistakes across persisted records.
- Keep adding unrelated value sets to `type-kinds.ts` without a rule. This preserves compatibility in the short term but makes the hotspot less intentional over time.
- Introduce a new abstraction layer for all enums. The current arrays are simple and readable; a wrapper would add ceremony without a current consumer need.

## Future Slice

The first implementation PR should choose one low-risk, single-family enum group, move it only if it satisfies the decision rule, and keep exports compatible. If no group satisfies the rule, the finding should be triaged as intentional shared vocabulary rather than refactored.
