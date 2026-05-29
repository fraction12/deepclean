## ADDED Requirements

### Requirement: Proof status in reports
The system SHALL include revalidation proof status in report, status, show, next, and handoff surfaces.

#### Scenario: Agent inspects a candidate after attempted fix
- **WHEN** an agent runs `deepclean show finding_<id> --json`
- **THEN** Deepclean includes the latest verification result, latest revalidation outcome, confidence, rationale, and recommended next action

### Requirement: Handoff freshness checks
The system SHALL warn when generating handoffs from stale, broad, suppressed, fixed, superseded, or low-confidence findings.

#### Scenario: Handoff target is stale
- **WHEN** an agent runs `deepclean handoff finding_<id>`
- **THEN** Deepclean includes a freshness warning or refuses according to strictness flags
