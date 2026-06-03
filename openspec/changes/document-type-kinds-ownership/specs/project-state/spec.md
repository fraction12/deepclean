# project-state Specification

## MODIFIED Requirements

### Requirement: Versioned state records
The system SHALL version persisted state records so future releases can migrate or validate them.

#### Scenario: Persisted enum vocabulary has shared ownership
- **WHEN** a persisted record enum vocabulary is shared across multiple record families
- **THEN** the system keeps that vocabulary in a stable shared owner unless a bounded subsystem can own the values without creating cycles or breaking compatibility
