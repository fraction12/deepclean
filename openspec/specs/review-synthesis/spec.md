# review-synthesis Specification

## Purpose
TBD - created by archiving change define-deepclean-mvp. Update Purpose after archive.
## Requirements
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
The system SHALL support maintainability investigation review modes focused on cleanup candidates, with built-in reviewer rubrics as the default and optional configured custom rubrics.

#### Scenario: Default scan runs
- **WHEN** an agent runs `deepclean scan --synthesize`
- **THEN** the default synthesis objective is to rank maintainability cleanup candidates using the built-in reviewer pack and not to generate code patches

### Requirement: Configurable reviewer pack
The system SHALL allow users to configure which built-in reviewer rubrics are enabled and optionally add custom reviewer rubric files.

#### Scenario: User enables a subset of reviewers
- **WHEN** config enables only architecture and testability reviewers
- **THEN** synthesis uses that subset and records the reviewer configuration in provenance

### Requirement: Custom reviewer validation
The system SHALL validate custom reviewer rubric files before including them in synthesis.

#### Scenario: Custom reviewer file is missing
- **WHEN** config references a missing custom reviewer path
- **THEN** synthesis does not run with silently incomplete instructions and records a structured configuration diagnostic

### Requirement: Reproducible default synthesis
The system MUST NOT depend on OpenClaw skills, local agent workspaces, or private user instruction files for default public-alpha synthesis behavior.

#### Scenario: User runs Deepclean outside OpenClaw
- **WHEN** a user installs Deepclean in a plain terminal and runs `deepclean scan --synthesize`
- **THEN** the built-in reviewer pack is sufficient for synthesis prompts without reading external agent skills

### Requirement: Credited external reviewer references
The system SHALL allow public engineering references to inform built-in reviewer rubrics only when they are vendored or documented with license attribution and distilled into reproducible prompt instructions.

#### Scenario: Matt Pocock skills are used as reviewer basis
- **WHEN** synthesis includes Matt Pocock-inspired reviewer guidance
- **THEN** the repository records the upstream source, snapshot commit, license, and distillation policy, and runtime synthesis uses built-in rubrics rather than fetching upstream skills dynamically
