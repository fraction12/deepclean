## MODIFIED Requirements

### Requirement: Initial evidence engine set
The system SHALL support an initial evidence engine set covering duplication, structural code facts, import/dependency graph, TS/JS project intelligence, optional external analyzer orchestration, git history signals, and test discovery.

#### Scenario: Scan runs on a TS/JS repository
- **WHEN** `deepclean scan` runs on a TypeScript or JavaScript repository
- **THEN** the system attempts to collect duplication, structural, dependency, TypeScript/JavaScript, git, and test evidence

## ADDED Requirements

### Requirement: TS source import graph resolution
The system SHALL resolve common TS/JS source import patterns into local graph edges.

#### Scenario: TS source imports emitted JS specifier
- **WHEN** a TypeScript source file imports `./module.js` and the repository contains `./module.ts`
- **THEN** the code graph records a local edge from the importing file to the TypeScript source file

### Requirement: Broad TS/JS import collection
The system SHALL collect static imports, re-exports, dynamic imports, and CommonJS `require(...)` calls for TS/JS graph evidence.

#### Scenario: File uses dynamic import
- **WHEN** a TS/JS file dynamically imports a local module with a string literal
- **THEN** the local graph considers that relationship during evidence collection

### Requirement: Optional Semgrep orchestration
The system SHALL optionally run Semgrep and normalize its SARIF output when configured.

#### Scenario: Semgrep is enabled
- **WHEN** `externalAnalyzers.semgrep.enabled` is true
- **THEN** Deepclean runs the configured Semgrep command, reads SARIF output, and records normalized analyzer evidence

#### Scenario: Semgrep is unavailable
- **WHEN** Semgrep is enabled but the configured command fails or is missing
- **THEN** Deepclean records a structured diagnostic and continues with remaining evidence adapters
