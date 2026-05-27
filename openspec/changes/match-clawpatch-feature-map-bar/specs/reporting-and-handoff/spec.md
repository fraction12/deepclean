## ADDED Requirements

### Requirement: Feature-first report organization
Deepclean SHALL organize report recommendations around mapped features when feature records exist.

#### Scenario: Report includes mapped candidates
- **WHEN** `deepclean report` runs after candidates have affected feature IDs
- **THEN** start-here guidance names the highest-value affected feature
- **AND** explains why the recommended cleanup should stay inside that feature boundary or be split.

### Requirement: Feature-scoped plans
Deepclean SHALL render plans and handoffs with feature ownership context when available.

#### Scenario: Plan is generated for a feature-scoped candidate
- **WHEN** `deepclean plan <candidate-id>` runs for a candidate with affected feature IDs
- **THEN** the plan lists the feature, entrypoints, owned files, context/shared files, tests-first guidance, verification commands, and non-goals.

#### Scenario: Handoff is generated for cross-feature work
- **WHEN** `deepclean handoff <candidate-id>` runs for a candidate marked cross-feature
- **THEN** the handoff warns that the work spans multiple feature boundaries
- **AND** recommends a smaller feature-local slice when one is available.
