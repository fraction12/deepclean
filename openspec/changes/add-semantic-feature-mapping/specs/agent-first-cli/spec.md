## ADDED Requirements

### Requirement: Feature map command
Deepclean SHALL provide a command for refreshing the semantic feature map without producing cleanup candidates.

#### Scenario: Map command writes feature state
- **WHEN** `deepclean map --json` runs in a supported repository
- **THEN** Deepclean writes `.deepclean/features/<mapId>.json`
- **AND** returns the mapped features and `featureCount` in JSON.
