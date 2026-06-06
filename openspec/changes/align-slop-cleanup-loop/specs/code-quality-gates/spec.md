# code-quality-gates Specification

## ADDED Requirements

### Requirement: CI findings classify actionability
The system SHALL classify CI and PR review findings by actionability without changing existing gate semantics.

#### Scenario: CI quality gate emits findings
- **WHEN** `deepclean ci --json` emits blockers, advisories, regressions, or improvements
- **THEN** each finding includes enough actionability metadata to distinguish merge blockers, warnings, cleanup recommendations, and review-only context

### Requirement: CI remains review-capable
The system SHALL keep CI and PR review as first-class DeepClean modes for catching slop before it compounds.

#### Scenario: PR review runs with target context
- **WHEN** `deepclean review-pr --target <id> --json` evaluates a change
- **THEN** the output uses slop/fixability metadata to decide whether the PR addressed the target, partially addressed it, broadened scope, or needs human review
