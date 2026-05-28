## MODIFIED Requirements

### Requirement: Versioned state records
The system SHALL version persisted state records so future releases can migrate or validate them.

#### Scenario: Split state is written
- **WHEN** `deepclean split <candidate>` updates candidates, findings, observations, and lifecycle events
- **THEN** each written record includes a schema version and validates against the current state schema

## ADDED Requirements

### Requirement: Decomposition audit trail
The system SHALL preserve an audit trail for candidate decomposition.

#### Scenario: Split command succeeds
- **WHEN** Deepclean decomposes a parent candidate
- **THEN** it writes updated latest candidates, finding records with decomposition metadata, candidate observations for parent and children, and a lifecycle event that links the parent to its child candidates
