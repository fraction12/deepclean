# review-synthesis Specification

## MODIFIED Requirements

### Requirement: Partial synthesis handling
The system SHALL handle provider failures without discarding local evidence collected earlier in the scan.

#### Scenario: Provider process ignores timeout termination
- **WHEN** model synthesis exceeds the configured timeout and the provider process does not exit after the first termination signal
- **THEN** the scan still finishes within a bounded grace period, persists collected local evidence, records a provider timeout diagnostic, and avoids persisting unsupported model findings
