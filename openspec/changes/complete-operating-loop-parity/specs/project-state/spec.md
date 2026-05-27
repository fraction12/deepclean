## MODIFIED Requirements

### Requirement: Candidate and cluster state
The system SHALL persist stable findings, per-run candidate observations, related clusters, and lifecycle state with status, priority, confidence, impact, effort, risk, evidence references, signatures, timestamps, and history links.

#### Scenario: Related candidates are discovered
- **WHEN** multiple candidates describe the same broader maintainability concern
- **THEN** the system records a cluster that links those candidates without losing their individual IDs, stable finding IDs, or observation history

### Requirement: Triage history
The system SHALL preserve triage and lifecycle changes as append-only history rather than overwriting the only record of a candidate's status.

#### Scenario: Agent ignores a candidate
- **WHEN** an agent runs `deepclean triage finding_<id> --status ignored --note "intentional boundary"`
- **THEN** the finding status changes and a lifecycle event records the old status, new status, note, actor, command, and timestamp

## ADDED Requirements

### Requirement: Stable finding records
The system SHALL persist a durable finding record whose identity can survive rescans, incremental runs, display-ID changes, and small source edits.

#### Scenario: Same issue appears in a later scan
- **WHEN** a later scan observes the same maintainability concern with matching signature evidence
- **THEN** Deepclean links the new candidate observation to the existing durable finding rather than creating an unrelated finding

### Requirement: Candidate observations
The system SHALL store each run-specific candidate as an observation of a stable finding.

#### Scenario: Finding is observed in multiple runs
- **WHEN** a finding is detected in two different scans
- **THEN** each scan has its own observation record while the stable finding keeps a combined lifecycle view

### Requirement: Lifecycle event store
The system SHALL store lifecycle events for findings, themes, reports, plans, handoffs, revalidations, and fix attempts.

#### Scenario: Finding changes state
- **WHEN** a finding is created, triaged, revalidated, fixed, marked stale, superseded, or suppressed
- **THEN** Deepclean appends a lifecycle event without deleting prior events

### Requirement: State indexes
The system SHALL maintain indexes needed to resolve latest artifacts, stable findings, display IDs, signatures, and lifecycle history.

#### Scenario: Agent resolves an old display ID
- **WHEN** an agent runs `deepclean show candidate-014 --run <old-run-id>`
- **THEN** Deepclean resolves the historical observation and links to the current stable finding when one exists

### Requirement: State writer locks
The system SHALL guard write operations with project-local locks that identify the owner, process, command, state path, and timestamp.

#### Scenario: Scan is already writing state
- **WHEN** a second write command starts while a valid lock exists
- **THEN** Deepclean refuses or waits according to command flags and emits a structured lock diagnostic

### Requirement: Stale lock recovery
The system SHALL detect stale locks and require explicit recovery before writing through them.

#### Scenario: Prior process died
- **WHEN** a lock references a dead process or exceeds the stale-lock threshold
- **THEN** `deepclean status` reports the stale lock and `deepclean doctor` explains the recovery command

### Requirement: Retention manifests
The system SHALL record what a prune operation would delete or did delete.

#### Scenario: User previews cleanup
- **WHEN** an agent runs `deepclean prune --dry-run --json`
- **THEN** Deepclean writes or returns a retention manifest listing candidate deletions, retained dependencies, blocked deletions, and privacy notes

### Requirement: Lazy alpha migration
The system SHALL lazily migrate earlier alpha records into the stable finding and lifecycle model.

#### Scenario: Existing alpha state is loaded
- **WHEN** `.deepclean/` contains candidates without stable signatures
- **THEN** Deepclean computes best-effort signatures, marks identity confidence, preserves original IDs, and reports migration diagnostics
