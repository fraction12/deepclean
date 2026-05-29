## ADDED Requirements

### Requirement: Lifecycle-aware status command
The system SHALL provide `deepclean status` to summarize current project-local Deepclean state and cleanup progress.

#### Scenario: Agent checks project state
- **WHEN** an agent runs `deepclean status --json`
- **THEN** Deepclean reports latest run, latest report, open finding counts, stale finding counts, fixed finding counts, suppressed finding counts, active locks, artifact counts, pending revalidation work, recent progress, blocked work, and a recommended next command

### Requirement: Status is read-only
The system SHALL keep status inspection read-only.

#### Scenario: Agent inspects status
- **WHEN** an agent runs `deepclean status`
- **THEN** Deepclean reads project-local state and does not modify source files, lifecycle state, or generated artifacts
