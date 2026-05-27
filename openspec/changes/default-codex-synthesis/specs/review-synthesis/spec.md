## MODIFIED Requirements

### Requirement: Review modes
The system SHALL support maintainability investigation review modes focused on cleanup candidates, with built-in reviewer rubrics as the default and optional configured custom rubrics. The default scan mode SHALL run model-backed synthesis after local evidence collection unless the user explicitly selects evidence-only or local-only operation, regardless of legacy `reviewSynthesis.enabled` values.

#### Scenario: Default scan runs
- **WHEN** an agent runs `deepclean scan`
- **THEN** the system first collects local evidence and then runs review synthesis using the built-in reviewer pack without generating code patches

#### Scenario: Evidence-only scan runs
- **WHEN** an agent runs `deepclean scan --evidence-only` or `deepclean scan --local-only`
- **THEN** the system persists local evidence and local candidates without invoking a model provider

### Requirement: Partial synthesis handling
The system SHALL handle provider failures without discarding local evidence collected earlier in the scan.

#### Scenario: Provider fails after evidence collection
- **WHEN** default or explicitly requested model synthesis fails because the provider is unavailable or returns invalid output
- **THEN** the system persists local evidence and scan diagnostics so the run can be resumed or inspected
