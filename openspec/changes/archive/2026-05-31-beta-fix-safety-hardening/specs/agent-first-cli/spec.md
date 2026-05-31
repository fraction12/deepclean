## ADDED Requirements

### Requirement: Fix command
The system SHALL provide a guarded `deepclean fix <id>` command for one bounded local patch attempt.

#### Scenario: Agent applies a bounded fix
- **WHEN** an agent runs `deepclean fix finding_<id> --apply --verification "npm test" --json`
- **THEN** Deepclean applies at most one scoped patch attempt, runs verification, records the result, and returns structured outcome data

### Requirement: Fix refusal diagnostics
The system SHALL return structured diagnostics when a fix is unsafe to attempt.

#### Scenario: Candidate is not ready
- **WHEN** an agent runs `deepclean fix finding_<id> --apply --json` against a stale, broad, low-confidence, or unplanned finding
- **THEN** Deepclean refuses and reports the exact readiness gate that failed
