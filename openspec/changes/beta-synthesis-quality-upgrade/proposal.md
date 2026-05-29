# Beta Synthesis Quality Upgrade

## Why

Deepclean's beta value depends on candidate quality. The synthesis agent should not merely find plausible smells; it should decide whether a concern is PR-sized, needs splitting, needs design, has proof, and has clear non-goals.

This change sharpens the built-in reviewer pack and accepted candidate schema.

## What Changes

- Add explicit synthesis pressure for split vs fix vs design-needed.
- Require PR-sized actionability assessment.
- Require proof needed to call the candidate resolved.
- Require owned files, context files, non-goals, and out-of-scope warnings.
- Require "next agent should not touch" guidance for risky boundaries.
- Improve rejection/downgrade diagnostics for broad, unsupported, duplicate, or low-evidence candidates.
- Record reviewer rubric versions in provenance.

## Non-Goals

- No dependence on private OpenClaw skills.
- No dynamic fetching of external reviewer prompts at runtime.
- No patch execution.
- No CI policy gates.

## Success Bar

Reports should contain fewer vague architecture smells and more agent-ready slices. Broad findings should either be split into bounded children or explicitly marked design-needed with proof and non-goals.

## Capabilities

### Modified Capabilities

- `review-synthesis`: reviewer pack and strict candidate schema.
- `maintainability-candidates`: actionability, split/design/fix readiness, and ranking.
- `reporting-and-handoff`: clearer plans and handoffs from synthesized fields.

## Impact

- Prompt templates and reviewer pack metadata.
- Candidate JSON schema.
- Synthesis validation and rejection diagnostics.
- Fixtures for broad, unsupported, duplicate, and PR-sized candidates.
