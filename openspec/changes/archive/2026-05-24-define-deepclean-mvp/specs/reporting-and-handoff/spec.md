## ADDED Requirements

### Requirement: Durable report generation
The system SHALL generate durable reports from persisted candidate and evidence state.

#### Scenario: Report command runs
- **WHEN** an agent runs `deepclean report`
- **THEN** the system writes a report artifact under `.deepclean/` and prints a summary of open candidates

### Requirement: Report content
The system SHALL include candidate ID, title, category, priority, confidence, impact, effort, risk, files, evidence summary, why it matters, likely root cause, suggested direction, and verification path in detailed reports.

#### Scenario: Agent inspects report JSON
- **WHEN** an agent runs `deepclean report --json`
- **THEN** each candidate summary includes enough fields for prioritization without requiring source-code mutation

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
