## MODIFIED Requirements

### Requirement: Ranking rubric
The system SHALL rank candidates using priority, provenance, confidence, impact, effort, risk, and evidence quality fields.

#### Scenario: Model and local candidates share priority
- **WHEN** a model-synthesized candidate and a local metric-derived candidate have the same priority and comparable confidence
- **THEN** the model-synthesized candidate is ranked first when it cites valid evidence and has broader cleanup value

## ADDED Requirements

### Requirement: Candidate noise controls
The system SHALL prevent local evidence adapters from flooding the open candidate queue with repetitive raw metric findings.

#### Scenario: Adapter emits many similar findings
- **WHEN** one adapter emits many candidates of the same kind in the same module area
- **THEN** the system caps or groups those candidates while preserving the underlying evidence records

### Requirement: Configurable candidate caps
The system SHALL allow public-alpha users to configure candidate caps by evidence kind and module area.

#### Scenario: User adjusts local evidence volume
- **WHEN** the user configures a lower cap for duplicate-cluster candidates
- **THEN** subsequent scans keep fewer local duplication candidates while still persisting duplication evidence

### Requirement: Broad cluster detection
The system SHALL identify clusters that are too broad to hand directly to an agent.

#### Scenario: Cluster is too broad
- **WHEN** a cluster includes too many candidates, files, module areas, or categories to be a bounded work packet
- **THEN** the system marks the cluster as broad and recommends splitting rather than generating an oversized plan by default

### Requirement: Cluster splitting
The system SHALL split broad clusters into smaller cleanup themes when graph, module-area, category, or reviewer-surface signals support a safe split.

#### Scenario: Broad cluster spans admin and backend work
- **WHEN** a cluster contains unrelated admin UI and backend orchestration candidates
- **THEN** the system produces separate bounded clusters or reports a warning explaining why it cannot split safely
