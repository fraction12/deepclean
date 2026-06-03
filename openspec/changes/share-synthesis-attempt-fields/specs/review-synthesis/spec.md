# review-synthesis Specification

## MODIFIED Requirements

### Requirement: Synthesis attempt ledger
The system SHALL persist a provider attempt ledger for each synthesis run.

#### Scenario: Shared attempt fields are built consistently
- **WHEN** the system records either a single synthesis attempt or an aggregate chunked synthesis attempt
- **THEN** shared runtime controls and evidence manifest fields are built through common internal construction while preserving the persisted attempt record shape
