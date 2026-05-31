## ADDED Requirements

### Requirement: Chunked whole-repo synthesis
The system SHALL keep scans repository-wide while splitting provider synthesis into scoped packets when the full evidence bundle is too large or broad for one useful model call.

#### Scenario: Large repository scan synthesizes in chunks
- **WHEN** a scan has synthesis enabled and the full synthesis bundle exceeds configured budget or broadness thresholds
- **THEN** Deepclean plans multiple scoped synthesis packets from local evidence, feature map entries, and local metric candidates
- **AND** provider failures in one packet do not prevent other packets from producing candidates
- **AND** the scan output remains one repository-wide candidate queue

### Requirement: Chunked synthesis ledger
The system SHALL persist chunk metadata in the run-level synthesis attempt record.

#### Scenario: Chunked synthesis completes
- **WHEN** a scan runs chunked provider synthesis
- **THEN** the synthesis attempt records chunk count, per-chunk evidence counts, aggregate prompt bytes, aggregate validations, and diagnostics
- **AND** accepted candidates reference validation IDs that can be resolved by `deepclean explain`
