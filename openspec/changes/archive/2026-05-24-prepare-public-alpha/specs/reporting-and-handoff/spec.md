## MODIFIED Requirements

### Requirement: Report content
The system SHALL include candidate ID, title, category, priority, confidence, impact, effort, risk, files, evidence summary, why it matters, likely root cause, suggested direction, verification path, report warnings, and start-here guidance in detailed reports.

#### Scenario: Agent inspects report JSON
- **WHEN** an agent runs `deepclean report --json`
- **THEN** the report includes enough recommendation, warning, artifact path, and candidate metadata for prioritization without requiring source-code mutation

## ADDED Requirements

### Requirement: Start-here recommendation
The system SHALL include a start-here recommendation in public-alpha reports.

#### Scenario: Report has actionable findings
- **WHEN** `deepclean report` runs after a scan with open candidates
- **THEN** the report identifies the best first candidate or cluster and explains why it should be handled first

### Requirement: Top cleanup themes
The system SHALL show top cleanup themes before the flat candidate list.

#### Scenario: Related candidates exist
- **WHEN** clusters exist for the latest run
- **THEN** the report lists bounded clusters ahead of raw candidates and labels any broad clusters as warnings

### Requirement: Report artifact paths
The system SHALL expose generated report and plan artifact paths in JSON output.

#### Scenario: Agent requests report JSON
- **WHEN** `deepclean report --json` writes markdown and JSON report artifacts
- **THEN** the command response includes the artifact paths using stable field names

### Requirement: Public-alpha plan guidance
The system SHALL recommend plans for top candidates and bounded clusters without executing fixes.

#### Scenario: Top candidate has no plan
- **WHEN** a report identifies a start-here candidate with no existing plan artifact
- **THEN** the report suggests the exact `deepclean plan <id>` command
