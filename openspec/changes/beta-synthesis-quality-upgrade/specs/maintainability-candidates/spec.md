## ADDED Requirements

### Requirement: Candidate actionability
The system SHALL store actionability metadata for each accepted candidate.

#### Scenario: Agent asks for next work
- **WHEN** `deepclean next --json` chooses a candidate
- **THEN** candidates marked fix-ready are preferred over broader items with equal priority unless risk, confidence, or freshness says otherwise

### Requirement: Split recommendation
The system SHALL represent broad candidates as parents with bounded child recommendations when safe slices are available.

#### Scenario: Candidate is too broad
- **WHEN** synthesis finds one concern spanning multiple unrelated source areas
- **THEN** Deepclean creates or recommends bounded child slices and marks the parent split-needed
