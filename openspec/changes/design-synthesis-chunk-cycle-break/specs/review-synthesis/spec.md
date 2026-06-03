# review-synthesis Specification

## MODIFIED Requirements

### Requirement: Model synthesis uses evidence bundles
The system SHALL invoke Codex or another configured model only with bounded evidence bundles and selected excerpts produced by local discovery.

#### Scenario: Synthesis chunk planning keeps shared contracts acyclic
- **WHEN** synthesis chunk planning splits implementation responsibilities across public planning and area planning modules
- **THEN** shared chunk-planning contracts are owned by a stable leaf module rather than by one implementation module that imports the other
