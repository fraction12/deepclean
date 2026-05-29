## ADDED Requirements

### Requirement: Fitness progress reporting
The system SHALL surface recent measurable fitness deltas in progress output.

#### Scenario: Revalidation records metric progress
- **WHEN** recent lifecycle events include revalidation progress with before and after values
- **THEN** `deepclean status` reports the metric movement in human output and structured JSON
