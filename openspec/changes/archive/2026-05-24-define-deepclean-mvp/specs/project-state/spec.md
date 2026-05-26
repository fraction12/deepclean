## ADDED Requirements

### Requirement: Project-local state directory
The system SHALL persist Deepclean state in a project-local `.deepclean/` directory by default.

#### Scenario: Project is initialized
- **WHEN** a user runs `deepclean init` in a repository
- **THEN** the system creates or validates `.deepclean/` without modifying application source files

### Requirement: Versioned state records
The system SHALL version persisted state records so future releases can migrate or validate them.

#### Scenario: State record is written
- **WHEN** the system writes config, run, evidence, candidate, cluster, report, triage, or handoff records
- **THEN** each record includes a schema version and record type

### Requirement: Config record
The system SHALL persist project configuration including enabled evidence adapters, provider settings, scan exclusions, report preferences, and privacy settings.

#### Scenario: Config is loaded
- **WHEN** an agent runs `deepclean scan`
- **THEN** the system loads the effective config from defaults, `.deepclean/config.json`, and explicit CLI flags

### Requirement: Run record
The system SHALL persist a run record for each scan with timestamps, command arguments, adapter diagnostics, provider metadata, and generated artifact IDs.

#### Scenario: Scan completes
- **WHEN** `deepclean scan` completes
- **THEN** the system writes a run record that can be inspected later for provenance

### Requirement: Evidence record store
The system SHALL persist normalized evidence records separately from synthesized candidates.

#### Scenario: Candidate references evidence
- **WHEN** a candidate is written
- **THEN** it references evidence IDs that exist in the evidence record store

### Requirement: Candidate and cluster state
The system SHALL persist candidates and related clusters with status, priority, confidence, impact, effort, risk, evidence references, and timestamps.

#### Scenario: Related candidates are discovered
- **WHEN** multiple candidates describe the same broader maintainability concern
- **THEN** the system records a cluster that links those candidates without losing their individual IDs

### Requirement: Triage history
The system SHALL preserve triage changes as history rather than overwriting the only record of a candidate's status.

#### Scenario: Agent ignores a candidate
- **WHEN** an agent runs `deepclean triage candidate-014 --status ignored --note "intentional boundary"`
- **THEN** the candidate status changes and a triage history entry records the old status, new status, note, and timestamp
