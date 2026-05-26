## MODIFIED Requirements

### Requirement: Config record
The system SHALL persist project configuration including enabled evidence adapters, provider settings, scan exclusions, report preferences, candidate caps, reviewer-pack settings, and privacy settings.

#### Scenario: Config is loaded
- **WHEN** an agent runs `deepclean scan`
- **THEN** the system loads the effective config from defaults, `.deepclean/config.json`, and explicit CLI flags

## ADDED Requirements

### Requirement: Public-alpha state compatibility
The system SHALL preserve compatibility with state written by earlier private-alpha scans or provide clear migration diagnostics.

#### Scenario: Existing state is loaded
- **WHEN** a user runs public-alpha Deepclean in a repository that already has `.deepclean/` state
- **THEN** the command validates state versions and reports a structured migration or compatibility diagnostic if needed

### Requirement: State privacy guidance
The system SHALL document whether `.deepclean/` artifacts may contain private source paths, evidence summaries, source excerpts, or model prompt metadata.

#### Scenario: User prepares repository for sharing
- **WHEN** a user reads public-alpha privacy docs
- **THEN** the docs explain whether `.deepclean/` should be ignored, committed, or scrubbed before sharing
