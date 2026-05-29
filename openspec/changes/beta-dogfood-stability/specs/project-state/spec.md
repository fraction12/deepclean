## ADDED Requirements

### Requirement: Partial state recovery diagnostics
The system SHALL detect partial writes, duplicate IDs, stale artifacts, and old alpha records with structured diagnostics.

#### Scenario: Prior run was interrupted
- **WHEN** Deepclean loads `.deepclean/` state containing partial records
- **THEN** doctor and status report the problem and commands avoid silent corruption

### Requirement: Generated artifact noise handling
The system SHALL avoid treating generated, vendored, ignored, or build-output files as first-class cleanup evidence unless explicitly configured.

#### Scenario: Repo contains generated files
- **WHEN** Deepclean scans a repo with ignored build output
- **THEN** the scan excludes or downgrades generated-file evidence according to config and records the decision
