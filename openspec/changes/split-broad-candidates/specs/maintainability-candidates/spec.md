## MODIFIED Requirements

### Requirement: Maintainability candidate records
The system SHALL represent maintainability candidates with stable IDs, evidence references, impacted files, affected features when available, status, priority, confidence, impact, effort, risk, provenance, and optional decomposition metadata.

#### Scenario: Child candidate is persisted
- **WHEN** a broad candidate is split
- **THEN** each child candidate records its parent candidate ID, root candidate ID, split strategy, sequence, total child count, and reason

#### Scenario: Parent candidate is persisted
- **WHEN** a broad candidate is split
- **THEN** the parent candidate records its child candidate IDs, root candidate ID, split strategy, reason, and superseded status
