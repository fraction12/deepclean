# maintainability-candidates Specification

## MODIFIED Requirements

### Requirement: Candidate categories
The system SHALL classify maintainability candidates into architecture, complexity, duplication, testability, dead weight, AI-slop signals, domain drift, or another documented category.

#### Scenario: Candidate is created
- **WHEN** the system writes a candidate
- **THEN** the candidate includes exactly one primary category, a derived slop type, and may include secondary tags

## ADDED Requirements

### Requirement: Slop taxonomy
The system SHALL label candidate output with a stable slop type that describes the mess found without exposing internal detector details.

#### Scenario: Local or synthesized slop is persisted
- **WHEN** the system writes a candidate from local evidence or Codex synthesis
- **THEN** the candidate includes or can derive a slop type of structure, duplication, complexity, testability, dead-weight, ai-slop, domain-drift, analyzer, or metric-only

### Requirement: Fixability taxonomy
The system SHALL label candidate output with fixability so users know whether DeepClean can fix it, an agent should fix it, a human design decision is needed, the result is review-only, or the result is noise.

#### Scenario: Candidate is ready for cleanup routing
- **WHEN** the system ranks or reports an open candidate
- **THEN** the candidate includes or can derive fixability as auto-fixable, agent-fixable, human-design-needed, review-only, or noise
