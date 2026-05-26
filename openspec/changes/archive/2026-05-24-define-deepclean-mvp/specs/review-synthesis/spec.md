## ADDED Requirements

### Requirement: Model synthesis uses evidence bundles
The system SHALL invoke Codex or another configured model only with bounded evidence bundles and selected excerpts produced by local discovery.

#### Scenario: Scan reaches synthesis phase
- **WHEN** local evidence collection completes
- **THEN** the review synthesis step receives normalized evidence, graph summaries, relevant excerpts, and repository context rather than an unbounded request to review the entire repository

### Requirement: Strict synthesis schema
The system SHALL validate model output against strict schemas before persisting candidates, clusters, or report content.

#### Scenario: Model returns malformed output
- **WHEN** provider output does not match the required schema
- **THEN** the system records a synthesis diagnostic and does not persist malformed candidates

### Requirement: Candidate provenance from synthesis
The system SHALL record synthesis provenance for model-generated candidates, including provider, model identifier when available, prompt template version, evidence bundle ID, and run ID.

#### Scenario: Model-generated candidate is saved
- **WHEN** review synthesis creates a candidate
- **THEN** the candidate records which provider and evidence bundle produced it

### Requirement: Private-code safety
The system SHALL keep repository source local unless the user explicitly configures a provider that receives source excerpts.

#### Scenario: Web research is enabled later
- **WHEN** the system enriches context using web research or framework documentation
- **THEN** it uses dependency names, framework names, public docs, and generated queries rather than uploading private source code

### Requirement: Evidence-grounded synthesis
The system MUST NOT persist a model-generated candidate unless it cites supporting evidence IDs or explicit source/document excerpts captured in the evidence bundle.

#### Scenario: Model suggests unsupported issue
- **WHEN** the model returns a plausible maintainability concern without cited evidence
- **THEN** the system rejects or downgrades the item to a diagnostic rather than saving it as an open candidate

### Requirement: Partial synthesis handling
The system SHALL handle provider failures without discarding local evidence collected earlier in the scan.

#### Scenario: Provider fails after evidence collection
- **WHEN** model synthesis fails because the provider is unavailable or returns invalid output
- **THEN** the system persists local evidence and scan diagnostics so the run can be resumed or inspected

### Requirement: Review modes
The system SHALL support a maintainability investigation review mode focused on cleanup candidates rather than bug-fix patch generation.

#### Scenario: Default scan runs
- **WHEN** an agent runs `deepclean scan`
- **THEN** the default synthesis objective is to rank maintainability cleanup candidates and not to generate code patches

