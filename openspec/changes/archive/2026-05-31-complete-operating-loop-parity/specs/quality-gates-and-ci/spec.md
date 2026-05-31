## ADDED Requirements

### Requirement: CI mode
The system SHALL provide a non-interactive CI workflow with explicit policy gates.

#### Scenario: Pull request CI runs
- **WHEN** CI runs `deepclean ci --since main --json`
- **THEN** Deepclean scans the requested scope, applies configured policy, writes artifacts, and exits with a predictable success or policy-failure code

### Requirement: Policy gates
The system SHALL support policy gates for new findings, priority counts, category counts, risk counts, stale findings, confidence thresholds, and broad-theme warnings.

#### Scenario: Policy blocks critical new findings
- **WHEN** `deepclean ci --max-new-p0 0` detects a new priority-zero finding
- **THEN** the command exits with a policy-failure code and reports the blocking finding IDs

### Requirement: Baseline-aware adoption
The system SHALL allow existing debt to be reported without failing CI unless policy explicitly targets existing findings.

#### Scenario: Existing finding remains unchanged
- **WHEN** a finding exists in the baseline and is unchanged in the current branch
- **THEN** CI reports the finding but does not fail a new-finding gate

### Requirement: CI artifacts
The system SHALL emit machine-readable JSON, human-readable Markdown, and optional SARIF artifacts for CI systems.

#### Scenario: CI requests SARIF
- **WHEN** an agent runs `deepclean ci --sarif .deepclean/deepclean.sarif --json`
- **THEN** Deepclean writes SARIF with stable finding IDs and source locations where available

### Requirement: CI-safe provider behavior
The system SHALL make provider usage in CI explicit and reproducible.

#### Scenario: Provider is unavailable in CI
- **WHEN** CI mode requires synthesis and the configured provider is unavailable
- **THEN** Deepclean fails with a configuration or provider diagnostic rather than silently producing a weaker local-only gate
