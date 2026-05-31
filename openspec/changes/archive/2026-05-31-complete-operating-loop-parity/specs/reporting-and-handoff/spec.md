## MODIFIED Requirements

### Requirement: Report content
The system SHALL include stable finding ID, run-specific candidate ID, title, category, priority, confidence, impact, effort, risk, status, lifecycle state, baseline status, files, evidence summary, why it matters, likely root cause, suggested direction, verification path, report warnings, and start-here guidance in detailed reports.

#### Scenario: Agent inspects report JSON
- **WHEN** an agent runs `deepclean report --json`
- **THEN** the report includes enough recommendation, warning, artifact path, stable finding metadata, and lifecycle metadata for prioritization without requiring source-code mutation

### Requirement: Next candidate selection
The system SHALL provide a `next` command that returns the highest-priority actionable open finding according to ranking, filters, baseline state, and lifecycle state.

#### Scenario: Agent asks for next work item
- **WHEN** an agent runs `deepclean next --json`
- **THEN** the command returns one open finding or a structured empty-queue result

## ADDED Requirements

### Requirement: Report filtering
The system SHALL support report filters for status, priority, category, risk, source, theme, path, age, owner, lifecycle state, revalidation state, and baseline status.

#### Scenario: Agent filters stale high-priority items
- **WHEN** an agent runs `deepclean report --status open --revalidation stale --priority p1 --json`
- **THEN** Deepclean returns a report scoped to matching findings and records the applied filters

### Requirement: Lifecycle-aware queue
The system SHALL keep stale, suppressed, fixed, superseded, and inconclusive findings out of the default start-here queue unless explicitly requested.

#### Scenario: Top-ranked finding is stale
- **WHEN** a high-priority finding has stale revalidation state
- **THEN** the default report recommends revalidation before handoff or fix work

### Requirement: Baseline comparison report
The system SHALL compare current findings against a prior run or git baseline when requested.

#### Scenario: Agent compares branch to main
- **WHEN** an agent runs `deepclean report --since main --json`
- **THEN** the report identifies new, existing, worsened, improved, fixed, and unknown findings

### Requirement: Agent queue export
The system SHALL export compact, filterable queues for worker agents.

#### Scenario: Agent exports backend queue
- **WHEN** an agent runs `deepclean list --path backend --format codex --json`
- **THEN** Deepclean returns stable finding IDs, problem statements, evidence summaries, constraints, and verification hints without oversized report prose

### Requirement: Handoff freshness checks
The system SHALL warn when generating handoffs from stale, broad, suppressed, fixed, or low-confidence findings.

#### Scenario: Handoff target is stale
- **WHEN** an agent runs `deepclean handoff finding_<id>`
- **THEN** Deepclean includes a freshness warning or refuses according to strictness flags
