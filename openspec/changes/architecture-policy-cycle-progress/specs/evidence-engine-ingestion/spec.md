## ADDED Requirements

### Requirement: Architecture policy graph evidence
The system SHALL apply configured architecture layers and import rules to the local architecture graph.

#### Scenario: Import violates a layer rule
- **WHEN** a file in one configured layer imports a file in a disallowed layer
- **THEN** Deepclean records architecture-boundary-violation evidence with the source path, target path, source layer, target layer, and violated rule

### Requirement: Dependency cycle evidence
The system SHALL detect bounded local dependency cycles from the architecture graph.

#### Scenario: Local source files form a cycle
- **WHEN** local import edges form a cycle
- **THEN** Deepclean records dependency-cycle evidence with the cycle path and involved files

## MODIFIED Requirements

### Requirement: Initial evidence engine set
The system SHALL support an initial evidence engine set covering duplication, structural code facts, import/dependency graph, TS/JS project intelligence, git history signals, test discovery, configured architecture policy, and dependency cycle signals.

#### Scenario: Scan runs on a TS/JS repository
- **WHEN** `deepclean scan` runs on a TypeScript or JavaScript repository
- **THEN** the system attempts to collect duplication, structural, dependency, TypeScript/JavaScript, git, test, architecture policy, and cycle evidence
