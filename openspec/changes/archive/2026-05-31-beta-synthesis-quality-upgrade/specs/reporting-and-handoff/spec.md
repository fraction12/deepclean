## ADDED Requirements

### Requirement: Readiness in report and handoff
The system SHALL show actionability, proof-needed, non-goals, and owned-file boundaries in reports, plans, and handoffs.

#### Scenario: Agent generates handoff
- **WHEN** `deepclean handoff finding_<id> --format codex` runs for a fix-ready candidate
- **THEN** the handoff includes owned files, context files, expected behavior, non-goals, verification hints, and boundaries the worker should not touch
