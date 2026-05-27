## ADDED Requirements

### Requirement: Semantic feature records
Deepclean SHALL persist semantic feature records as project-local generated state.

#### Scenario: Scan writes feature records
- **WHEN** `deepclean scan --json` completes
- **THEN** `.deepclean/features/<runId>.json` exists
- **AND** the scan JSON includes `featureCount`
- **AND** every feature has a stable `featureId`, kind, owned files, and verification commands.

#### Scenario: Status includes feature queue size
- **WHEN** initialized state contains a latest feature map
- **THEN** `deepclean status --json` includes the feature count in `queue.features`.
