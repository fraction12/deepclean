## ADDED Requirements

### Requirement: Progress summary
The system SHALL summarize cleanup progress using lifecycle, run, report, plan, handoff, revalidation, and fix-attempt records.

#### Scenario: Prior work exists
- **WHEN** `deepclean status --json` runs after plans, handoffs, or fix attempts have been created
- **THEN** Deepclean lists recent progress events with stable finding IDs, artifact paths, outcomes, and timestamps

### Requirement: Artifact freshness checks
The system SHALL warn when generated artifacts are stale relative to the current finding state or latest evidence.

#### Scenario: Handoff was generated before revalidation
- **WHEN** a finding has a handoff generated before the latest revalidation
- **THEN** status and handoff output identify the artifact as stale and recommend regenerating it before work

### Requirement: Lifecycle-aware queue
The system SHALL keep stale, suppressed, fixed, superseded, and inconclusive findings out of the default start-here queue unless explicitly requested.

#### Scenario: Top-ranked finding is stale
- **WHEN** a high-priority finding has stale revalidation state
- **THEN** the default report and status output recommend revalidation before handoff or fix work
