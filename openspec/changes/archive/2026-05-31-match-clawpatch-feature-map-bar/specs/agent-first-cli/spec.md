## ADDED Requirements

### Requirement: Source-selectable feature mapping
Deepclean SHALL allow agents to choose how semantic feature maps are produced.

#### Scenario: Agent requests heuristic map
- **WHEN** an agent runs `deepclean map --source heuristic --json`
- **THEN** Deepclean produces a feature map using deterministic local repository analysis
- **AND** no provider is required
- **AND** returned feature records identify `mapSource` as `heuristic`.

#### Scenario: Agent requests provider-assisted map
- **WHEN** an agent runs `deepclean map --source agent --json`
- **THEN** Deepclean starts from deterministic local map inputs
- **AND** provider output may refine labels, merges, splits, or summaries only after schema validation.

### Requirement: Feature-scoped inspection
Deepclean SHALL support feature-scoped inspection for agent workflows that need to stay inside one mapped feature boundary.

#### Scenario: Agent filters report by feature
- **WHEN** an agent runs `deepclean report --feature <feature-id> --json`
- **THEN** the report includes candidates and clusters associated with that feature
- **AND** the response includes the selected feature record or a structured diagnostic if the feature ID is unknown.
