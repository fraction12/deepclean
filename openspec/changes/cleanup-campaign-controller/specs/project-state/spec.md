## MODIFIED Requirements

### Requirement: Versioned state records
The system SHALL version persisted state records so future releases can migrate or validate them.

#### Scenario: Opportunity or quality state is written
- **WHEN** Deepclean writes PR opportunity, campaign summary, quality profile, or quality gate result records
- **THEN** each record includes a schema version, record type, creation timestamp, source run ID, and validates against the current state schema

## ADDED Requirements

### Requirement: PR opportunity state
The system SHALL persist PR opportunity records under project-local `.deepclean/` state.

#### Scenario: Opportunities are generated
- **WHEN** `deepclean next`, `deepclean report`, or `deepclean campaign` builds opportunity recommendations
- **THEN** Deepclean writes opportunity records for the latest run under `.deepclean/opportunities/`
- **AND** records remain traceable to candidates, findings, clusters, evidence, and features

### Requirement: Campaign summary state
The system SHALL persist campaign summary artifacts as derived state.

#### Scenario: Campaign summary is generated
- **WHEN** an agent runs `deepclean campaign --json`
- **THEN** Deepclean writes a campaign summary under `.deepclean/campaigns/`
- **AND** the summary identifies the current recommendation or stop-campaign result without becoming the source of truth for findings

### Requirement: Opportunity lifecycle audit trail
The system SHALL record lifecycle events when PR opportunities are recommended, completed, superseded, or rejected.

#### Scenario: Opportunity is superseded
- **WHEN** a new scan changes the best PR opportunity or marks a previous opportunity stale/resolved
- **THEN** Deepclean records a lifecycle event linking the prior opportunity to the current campaign state

### Requirement: Quality gate state
The system SHALL persist quality profile and quality gate result records under project-local `.deepclean/` state.

#### Scenario: Quality gate runs
- **WHEN** `deepclean ci --profile <profile> --json` evaluates a quality gate
- **THEN** Deepclean writes a quality gate result under `.deepclean/quality/results/`
- **AND** the result remains traceable to the scan run, selected profile, baseline reference, analyzer evidence, candidates, findings, and PR target verdict when present
