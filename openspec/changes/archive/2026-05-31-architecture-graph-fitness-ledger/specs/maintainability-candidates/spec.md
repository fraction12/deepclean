## ADDED Requirements

### Requirement: Dependency hotspot campaign progress
The system SHALL treat reductions in dependency hotspot pressure as measurable campaign progress.

#### Scenario: Incoming dependency pressure decreases
- **WHEN** revalidation compares previous and current dependency hotspot evidence for the same file
- **AND** the current incoming dependency count is lower
- **THEN** Deepclean records partially-resolved progress with the before count, after count, delta, metric, and evidence IDs

#### Scenario: Outgoing dependency pressure decreases
- **WHEN** revalidation compares previous and current dependency hotspot evidence for the same file
- **AND** the current outgoing dependency count is lower
- **THEN** Deepclean records partially-resolved progress with the before count, after count, delta, metric, and evidence IDs
