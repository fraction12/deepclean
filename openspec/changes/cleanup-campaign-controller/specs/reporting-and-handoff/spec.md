## MODIFIED Requirements

### Requirement: Next candidate selection
The system SHALL provide a `next` command that returns the safest highest-leverage PR opportunity according to campaign scoring, with compatibility fields for the primary candidate when available.

#### Scenario: Agent asks for next work item
- **WHEN** an agent runs `deepclean next --json`
- **THEN** the command returns one recommended PR opportunity or a structured stop-campaign result
- **AND** it includes target candidates, stop line, validation plan, risk, expected payoff, and refusal/classification rationale when applicable

### Requirement: Report content
The system SHALL include PR opportunity recommendations, campaign classification counts, candidate ID, title, category, priority, confidence, impact, effort, risk, files, evidence summary, why it matters, likely root cause, suggested direction, verification path, report warnings, and start-here guidance in detailed reports.

#### Scenario: Agent inspects report JSON
- **WHEN** an agent runs `deepclean report --json`
- **THEN** the report includes the recommended PR opportunity, classification counts, raw candidates, proof status, warnings, and artifact paths

### Requirement: Agent handoff packet
The system SHALL generate an agent-ready handoff packet for a selected PR opportunity, candidate, or cluster.

#### Scenario: Opportunity handoff is generated
- **WHEN** an agent runs `deepclean handoff <opportunity-id> --format codex`
- **THEN** the system emits a task packet containing problem statement, target candidates, exact write scope, context files, do-not-touch files, behavior invariants, validation plan, expected reviewer concern, stop line, and non-goals

### Requirement: Public-alpha plan guidance
The system SHALL recommend opportunity plans for top PR opportunities and bounded clusters without executing fixes.

#### Scenario: Top opportunity has no plan
- **WHEN** a report identifies a start-here opportunity with no existing plan artifact
- **THEN** the report suggests the exact `deepclean plan <opportunity-id>` command

## ADDED Requirements

### Requirement: Opportunity-first reports
The system SHALL show PR opportunities before raw candidates in report output.

#### Scenario: Report has safe and unsafe targets
- **WHEN** `deepclean report` runs after a scan with mixed candidate actionability
- **THEN** the report starts with the next PR opportunity or stop-campaign rationale
- **AND** raw candidates appear as supporting appendix material

### Requirement: Metric-only clarity
The system SHALL clearly label metric-only or synthesis-degraded reports.

#### Scenario: Synthesis accepts no candidates
- **WHEN** evidence and local candidates exist but provider synthesis produced zero accepted candidates
- **THEN** the report explains that the queue is metric-only or lower-confidence and should be treated as routing input rather than final PR guidance
