# reporting-and-handoff Specification

## Purpose
Deepclean produces durable reports, next-step recommendations, candidate drill-downs, triage records, plans, and agent handoff packets so cleanup work can move from discovery to execution without mutating source code outside explicit guarded fix workflows.
## Requirements
### Requirement: Durable report generation
The system SHALL generate durable reports from persisted candidate and evidence state.

#### Scenario: Report command runs
- **WHEN** an agent runs `deepclean report`
- **THEN** the system writes a report artifact under `.deepclean/` and prints a summary of open candidates

### Requirement: Report content
The system SHALL include candidate ID, title, category, priority, confidence, impact, effort, risk, files, evidence summary, why it matters, likely root cause, suggested direction, verification path, report warnings, and start-here guidance in detailed reports.

#### Scenario: Agent inspects report JSON
- **WHEN** an agent runs `deepclean report --json`
- **THEN** the report includes enough recommendation, warning, artifact path, and candidate metadata for prioritization without requiring source-code mutation

### Requirement: Next candidate selection
The system SHALL provide a `next` command that returns the highest-priority actionable open candidate according to the ranking rubric.

#### Scenario: Agent asks for next work item
- **WHEN** an agent runs `deepclean next --json`
- **THEN** the command returns one open candidate or a structured empty-queue result

### Requirement: Candidate drill-down
The system SHALL provide a `show` command that returns a full candidate record and its supporting evidence.

#### Scenario: Agent shows candidate
- **WHEN** an agent runs `deepclean show candidate-014 --json`
- **THEN** the command returns candidate details, evidence references, file locations, triage status, and handoff guidance when available

### Requirement: Triage workflow
The system SHALL allow agents to change candidate status with an explicit reason.

#### Scenario: Candidate is marked false positive
- **WHEN** an agent runs `deepclean triage candidate-014 --status false-positive --note <reason>`
- **THEN** the system updates candidate status and records the reason in triage history

### Requirement: Agent handoff packet
The system SHALL generate an agent-ready handoff packet for a selected candidate.

#### Scenario: Handoff is generated
- **WHEN** an agent runs `deepclean handoff candidate-014 --format codex`
- **THEN** the system emits a task packet containing problem statement, evidence, constraints, suggested direction, and verification commands

### Requirement: No fix execution in MVP
The system MUST NOT modify application source code, apply patches, commit changes, push branches, or open pull requests as part of the MVP reporting and handoff workflow.

#### Scenario: Agent requests handoff
- **WHEN** an agent runs a report, show, triage, or handoff command
- **THEN** the system only reads repository state and writes `.deepclean/` artifacts

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
