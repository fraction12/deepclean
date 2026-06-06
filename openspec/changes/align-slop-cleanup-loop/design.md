# Design

## North Star

DeepClean is a local slop detector and cleanup engine. Its outputs should answer three questions before anything else:

1. What slop exists?
2. Can DeepClean safely fix it?
3. If not, what does an agent or human need to fix it?

## Terms

### Slop Type

Slop type describes what kind of mess was found. It is a small reader-facing taxonomy derived from existing candidate category and provenance:

- `structure`
- `duplication`
- `complexity`
- `testability`
- `dead-weight`
- `ai-slop`
- `domain-drift`
- `analyzer`
- `metric-only`

### Fixability

Fixability describes what should happen next:

- `auto-fixable`: one bounded guarded fix may safely mutate source with verification and revalidation.
- `agent-fixable`: suitable for a human or coding agent with a plan/handoff, but not safe for unattended autofix.
- `human-design-needed`: valid slop, but needs design/spec/ownership before implementation.
- `review-only`: useful in CI/PR review as context or warning, not a cleanup target.
- `noise`: weak metric-only or duplicate signal that should not drive work.

## Derivation

Do not create a second orchestration engine. Derive fixability from existing fields:

- `safe-narrow-pr` + safe risk + fix-ready + verification => `auto-fixable`
- `tests-first`, moderate risk, or clear bounded plan but not guarded-safe => `agent-fixable`
- `spec-design-first`, design-needed risk/readiness, broad/cross-cutting ownership => `human-design-needed`
- CI analyzer findings with no cleanup scope, stale context, or policy advisories => `review-only`
- duplicate, weak metric-only, or unsupported low-confidence signal => `noise`

## Compatibility

Existing records keep their IDs and fields:

- `candidate-*` remains the persisted finding unit.
- `opportunity-*` remains the PR/fix target wrapper.
- `campaign` remains internal progress state.

New fields are additive and optional where older artifacts may be read.

## Implementation Order

1. Add type constants and schema fields.
2. Add tiny derivation helpers in one module.
3. Use helpers in opportunity building and report rendering.
4. Expose actionability in quality gate findings.
5. Add focused tests.

## Rejected Approach

Renaming everything to opportunity or hiding autofix/CI would make the product less true. The system should simplify the user's view without pretending the core product is only reports or handoffs.
