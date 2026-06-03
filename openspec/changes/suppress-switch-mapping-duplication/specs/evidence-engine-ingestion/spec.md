# evidence-engine-ingestion Specification

## MODIFIED Requirements

### Requirement: Initial evidence engine set
The system SHALL support an initial evidence engine set covering duplication, structural code facts, import/dependency graph, TS/JS project intelligence, git history signals, and test discovery.

#### Scenario: Duplicate detection sees repeated switch mappings
- **WHEN** multiple files contain matching line windows made only of switch `case` labels and simple `return` statements
- **THEN** the local duplication adapter does not emit duplicate-cluster evidence for that syntax-only switch mapping window
