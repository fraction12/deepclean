## ADDED Requirements

### Requirement: Dogfood diagnostics
The system SHALL emit structured diagnostics for dogfood-critical failures.

#### Scenario: Provider returns malformed output
- **WHEN** synthesis output is malformed during a dogfood run
- **THEN** Deepclean records the provider diagnostic, preserves local evidence, and status explains whether the run is inspectable or blocked
