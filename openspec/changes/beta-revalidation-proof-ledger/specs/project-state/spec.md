## ADDED Requirements

### Requirement: Revalidation proof records
The system SHALL persist revalidation records with target finding, evidence bundle, verification links, outcome, confidence, rationale, replacement link, and next action.

#### Scenario: Finding is revalidated after a fix
- **WHEN** revalidation completes
- **THEN** Deepclean writes a proof record that explains whether the original finding is resolved, partially-resolved, still-open, superseded, stale, inconclusive, or needs-human

### Requirement: Verification is not resolution
The system SHALL distinguish verification command success from finding resolution.

#### Scenario: Tests pass but finding remains
- **WHEN** verification passes but revalidation still observes the original issue
- **THEN** Deepclean records the verification success and marks the finding still-open or partially-resolved rather than resolved
