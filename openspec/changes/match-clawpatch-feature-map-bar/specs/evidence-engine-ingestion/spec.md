## ADDED Requirements

### Requirement: Deterministic feature ownership mapping
Deepclean SHALL build a local feature ownership map before evidence-backed cleanup planning when feature mapping is enabled.

#### Scenario: Repository has recognizable entrypoints
- **WHEN** a repository contains package scripts, CLI commands, routes, pages, components, services, jobs, workers, Python route modules, tests, or common config files
- **THEN** the feature mapper assigns those files to semantic feature records with file roles such as entrypoint, owned, context, shared, test, config, or generated.

#### Scenario: Generated paths are encountered
- **WHEN** generated, vendored, dependency, or build output paths are discovered
- **THEN** Deepclean MUST NOT mark those paths as feature-owned files by default.

### Requirement: Evidence feature attachment
Deepclean SHALL attach feature-map context to evidence records when local mapping can determine it.

#### Scenario: Evidence references mapped files
- **WHEN** an evidence record cites files that belong to one or more mapped features
- **THEN** the evidence record includes affected feature IDs and the mapped role of each cited file where available.

#### Scenario: Evidence spans shared files
- **WHEN** evidence cites a shared helper, config file, or adapter used by multiple features
- **THEN** Deepclean marks the file as shared or context rather than assigning exclusive ownership to one feature.
