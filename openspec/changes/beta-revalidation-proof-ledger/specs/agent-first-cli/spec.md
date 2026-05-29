## ADDED Requirements

### Requirement: Revalidation command
The system SHALL provide `deepclean revalidate` for candidates, findings, themes, and all open findings.

#### Scenario: Agent rechecks one finding
- **WHEN** an agent runs `deepclean revalidate finding_<id> --json`
- **THEN** Deepclean recollects the required evidence and records whether the finding is resolved, partially-resolved, still-open, superseded, stale, inconclusive, or needs-human
