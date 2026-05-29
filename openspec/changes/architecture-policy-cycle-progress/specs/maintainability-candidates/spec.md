## MODIFIED Requirements

### Requirement: Architecture candidates
The system SHALL identify architecture-oriented cleanup opportunities such as shallow modules, fake seams, concept spread, poor locality, cross-cutting state, dependency cycles, and configured layer-boundary violations.

#### Scenario: Concept is spread across unrelated files
- **WHEN** evidence shows a product concept implemented across unrelated modules with high coupling or repeated logic
- **THEN** the system may create an architecture candidate with explanation and cited evidence

#### Scenario: Architecture policy is violated
- **WHEN** evidence shows a configured layer-boundary violation
- **THEN** the system may create an architecture candidate that names the violated import direction and files
