## MODIFIED Requirements

### Requirement: Review modes
The system SHALL support maintainability investigation review modes focused on cleanup candidates, with built-in reviewer rubrics as the default and optional configured custom rubrics.

#### Scenario: Default scan runs
- **WHEN** an agent runs `deepclean scan --synthesize`
- **THEN** the default synthesis objective is to rank maintainability cleanup candidates using the built-in reviewer pack and not to generate code patches

## ADDED Requirements

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
