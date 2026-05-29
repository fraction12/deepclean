## MODIFIED Requirements

### Requirement: Review modes
The system SHALL support maintainability investigation review modes focused on cleanup candidates, with built-in reviewer rubrics as the default, optional configured custom rubrics, and explicit operational pressure for fix-ready, split-needed, and design-needed outcomes.

#### Scenario: Default serious scan runs
- **WHEN** an agent runs `deepclean scan`
- **THEN** the default synthesis objective is to rank maintainability cleanup candidates, classify actionability, and avoid generating code patches

## ADDED Requirements

### Requirement: Actionability classification
The system SHALL classify synthesized candidates as fix-ready, split-needed, design-needed, needs-human, or defer.

#### Scenario: Broad concern is found
- **WHEN** synthesis identifies a repo-wide concern that is not safe for one patch
- **THEN** Deepclean marks it split-needed or design-needed rather than presenting it as a fix-ready item

### Requirement: Proof and boundary metadata
The system SHALL require proof-needed, owned files, context files, expected behavior, non-goals, and do-not-touch guidance for accepted synthesized candidates.

#### Scenario: Candidate is accepted
- **WHEN** review synthesis persists a candidate
- **THEN** the candidate includes enough boundary and proof metadata for an agent to plan a bounded patch or refuse unsafe work

### Requirement: Synthesis quality diagnostics
The system SHALL reject or downgrade broad, unsupported, duplicate, low-evidence, or unverifiable synthesized candidates with structured diagnostics.

#### Scenario: Model returns vague architecture advice
- **WHEN** provider output describes a plausible issue without evidence, proof, or bounded action
- **THEN** Deepclean rejects, downgrades, or marks the item design-needed and records the reason
