## MODIFIED Requirements

### Requirement: Initial evidence engine set
The system SHALL support an initial evidence engine set covering duplication, structural code facts, import/dependency graph, TS/JS project intelligence, git history signals, and test discovery.

#### Scenario: Scan runs on a TS/JS repository
- **WHEN** `deepclean scan` runs on a TypeScript or JavaScript repository
- **THEN** the system attempts to collect duplication, structural, dependency, TypeScript/JavaScript, git, and test evidence

#### Scenario: Architecture graph evidence is collected
- **WHEN** Deepclean collects import/dependency graph evidence
- **THEN** code graph summaries and dependency hotspot records are derived from one shared local architecture graph
