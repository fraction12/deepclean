## ADDED Requirements

### Requirement: Structured evidence adapters
The system SHALL collect local evidence through structured adapters rather than relying on keyword or regex-only findings.

#### Scenario: Adapter produces evidence
- **WHEN** an evidence adapter completes
- **THEN** it returns typed evidence records with provenance, source locations where available, and adapter metadata

### Requirement: Regex-only findings are disallowed
The system MUST NOT create a maintainability candidate whose only support is an ad hoc regex or keyword match.

#### Scenario: Text pattern is detected
- **WHEN** a text pattern is found without parser, analyzer, graph, git, test, or model-supported evidence
- **THEN** the system may record it as low-level diagnostic evidence but MUST NOT promote it to a candidate by itself

### Requirement: Initial evidence engine set
The system SHALL support an initial evidence engine set covering duplication, structural code facts, import/dependency graph, TS/JS project intelligence, git history signals, and test discovery.

#### Scenario: Scan runs on a TS/JS repository
- **WHEN** `deepclean scan` runs on a TypeScript or JavaScript repository
- **THEN** the system attempts to collect duplication, structural, dependency, TypeScript/JavaScript, git, and test evidence

### Requirement: Adapter availability diagnostics
The system SHALL report missing or failed adapters as structured diagnostics without hiding partial results.

#### Scenario: jscpd is unavailable
- **WHEN** the duplication adapter cannot run because its tool is unavailable
- **THEN** the scan records an adapter diagnostic and continues with other enabled adapters when possible

### Requirement: Generated and vendored paths are excluded
The system SHALL exclude generated, vendored, dependency, build output, and configured ignored paths from evidence collection by default.

#### Scenario: Repository contains dependency output
- **WHEN** a repository contains `node_modules`, `dist`, generated files, or configured excluded paths
- **THEN** evidence adapters skip those paths unless explicitly configured otherwise

### Requirement: Evidence provenance
The system SHALL attach provenance to each evidence record, including adapter name, adapter version where available, scan run ID, source path, and confidence where applicable.

#### Scenario: Evidence is persisted
- **WHEN** the system writes an evidence record
- **THEN** the record identifies which engine produced it and which scan run collected it

### Requirement: Analyzer output normalization
The system SHALL normalize external analyzer outputs into Deepclean evidence schemas before candidate synthesis.

#### Scenario: Duplicate detector emits JSON
- **WHEN** the duplication adapter receives JSON output from jscpd or an equivalent tool
- **THEN** it stores normalized duplicate-cluster evidence rather than raw tool output alone

