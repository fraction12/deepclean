## MODIFIED Requirements

### Requirement: Semantic feature records
Deepclean SHALL persist semantic feature records as project-local generated state.

#### Scenario: Scan writes feature records
- **WHEN** `deepclean scan --json` completes
- **THEN** `.deepclean/features/<runId>.json` exists
- **AND** the scan JSON includes `featureCount`
- **AND** every feature has a stable `featureId`, kind, map source, entrypoints, owned files, file roles, confidence, reasons, and verification commands.

#### Scenario: Status includes feature queue size
- **WHEN** initialized state contains a latest feature map
- **THEN** `deepclean status --json` includes the feature count in `queue.features`.

## ADDED Requirements

### Requirement: Feature map provenance
Deepclean SHALL record how each persisted feature map was produced.

#### Scenario: Feature map is written
- **WHEN** Deepclean writes `.deepclean/features/<mapId>.json` or `.deepclean/features/<runId>.json`
- **THEN** each feature record identifies the map source, mapper version, run or map ID, and local reasons for the boundary.
