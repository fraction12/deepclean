## MODIFIED Requirements

### Requirement: Review modes
The system SHALL support maintainability investigation review modes focused on cleanup candidates, with built-in reviewer rubrics as the default, optional configured custom rubrics, and runtime controls for provider-backed synthesis.

#### Scenario: Default serious scan runs
- **WHEN** an agent runs `deepclean scan`
- **THEN** the default synthesis objective is to rank maintainability cleanup candidates using the built-in reviewer pack and not to generate code patches

## ADDED Requirements

### Requirement: Recommended synthesis posture
The system SHALL treat model-backed synthesis as the recommended path for serious cleanup reports while preserving deterministic local-only scans.

#### Scenario: User runs local-only report
- **WHEN** a report is generated from local-only evidence without synthesis
- **THEN** Deepclean labels local-only findings with appropriate confidence and recommends synthesis for higher-quality prioritization when a provider is available

### Requirement: Provider runtime controls
The system SHALL allow users to configure provider, model, effort, timeout, retries, requests per minute, concurrency, token budget, excerpt budget, offline mode, and privacy mode.

#### Scenario: Agent sets provider controls
- **WHEN** an agent runs `deepclean scan --model <model> --timeout 120 --rpm 10 --json`
- **THEN** Deepclean applies those runtime controls and records them in synthesis provenance

### Requirement: Provider degradation diagnostics
The system SHALL persist structured diagnostics for timeout, rate-limit, provider-unavailable, malformed-output, privacy-refusal, and budget-exceeded cases.

#### Scenario: Provider times out
- **WHEN** synthesis exceeds the configured timeout
- **THEN** Deepclean preserves collected local evidence, records a provider timeout diagnostic, and avoids persisting unsupported model findings

### Requirement: Offline and local-only modes
The system SHALL support explicit offline and local-only modes that avoid provider calls.

#### Scenario: User forbids provider calls
- **WHEN** an agent runs `deepclean scan --offline --json`
- **THEN** Deepclean does not invoke model providers or network analyzers and records that synthesis was skipped by policy

### Requirement: Privacy mode enforcement
The system SHALL enforce privacy settings before sending excerpts or metadata to any provider.

#### Scenario: Provider would receive source excerpts
- **WHEN** privacy mode disallows source excerpts
- **THEN** Deepclean either redacts the bundle or refuses synthesis with a structured privacy diagnostic
