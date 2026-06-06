# review-synthesis Specification

## MODIFIED Requirements

### Requirement: Fix-readiness metadata
The system SHALL capture bounded fix-readiness metadata for synthesized candidates.

#### Scenario: Synthesized candidate is accepted
- **WHEN** review synthesis accepts a model-generated candidate
- **THEN** the candidate records minimum fix scope, suggested regression test, why current tests may miss the issue, confidence downgrade reasons, and enough metadata to derive slop type and fixability

## ADDED Requirements

### Requirement: Synthesis supports slop routing
The system SHALL use Codex synthesis to explain higher-level slop while preserving deterministic routing for fixability.

#### Scenario: Codex synthesis suggests structural slop
- **WHEN** synthesized output passes evidence validation
- **THEN** DeepClean persists the finding with slop/fixability metadata or derives those labels from accepted candidate fields before reporting
