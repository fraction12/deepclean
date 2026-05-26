## ADDED Requirements

### Requirement: Candidate categories
The system SHALL classify maintainability candidates into architecture, complexity, duplication, testability, dead weight, AI-slop signals, domain drift, or another documented category.

#### Scenario: Candidate is created
- **WHEN** the system writes a candidate
- **THEN** the candidate includes exactly one primary category and may include secondary tags

### Requirement: Evidence-backed candidates
The system SHALL require each candidate to cite supporting evidence records and relevant file locations where available.

#### Scenario: Candidate appears in report
- **WHEN** `deepclean report --json` includes a candidate
- **THEN** the candidate includes evidence IDs and file references sufficient for `deepclean show <id>` to explain the finding

### Requirement: Ranking rubric
The system SHALL rank candidates using priority, confidence, impact, effort, and risk fields.

#### Scenario: Report is generated
- **WHEN** candidates are listed in a report
- **THEN** they are ordered by a documented ranking rubric rather than arbitrary discovery order

### Requirement: Architecture candidates
The system SHALL identify architecture-oriented cleanup opportunities such as shallow modules, fake seams, concept spread, poor locality, and cross-cutting state.

#### Scenario: Concept is spread across unrelated files
- **WHEN** evidence shows a product concept implemented across unrelated modules with high coupling or repeated logic
- **THEN** the system may create an architecture candidate with explanation and cited evidence

### Requirement: Complexity candidates
The system SHALL identify complexity hotspots such as large files, long functions, mixed responsibilities, tangled control flow, and hard-to-review modules.

#### Scenario: Complex module is detected
- **WHEN** evidence indicates a module has multiple responsibility signals and high structural complexity
- **THEN** the system may create a complexity candidate with suggested investigation direction

### Requirement: Duplication candidates
The system SHALL identify meaningful duplication in logic, components, configuration, literals, or validation paths.

#### Scenario: Duplicate logic cluster is detected
- **WHEN** duplication evidence shows similar logic across multiple files
- **THEN** the system may create a duplication candidate explaining the risk of divergent behavior

### Requirement: Testability candidates
The system SHALL identify code that is hard to test because logic is hidden behind UI, side effects, global state, missing seams, or weak source-to-test coverage.

#### Scenario: Feature logic lacks nearby tests
- **WHEN** evidence shows complex feature logic with no corresponding test discovery signal
- **THEN** the system may create a testability candidate with verification guidance

### Requirement: Dead weight candidates
The system SHALL identify unused exports, abandoned paths, obsolete files, and stale feature-flag paths when supported by evidence.

#### Scenario: Unused export evidence exists
- **WHEN** analyzer evidence indicates an export has no references
- **THEN** the system may create a dead weight candidate if the result is not excluded by config or known entrypoint rules

### Requirement: AI-slop candidates
The system SHALL identify maintainability patterns common in AI-generated code, including inconsistent naming, shallow helper sprawl, over-abstraction, repeated one-off patterns, and generated-looking fragmentation.

#### Scenario: Helper sprawl is detected
- **WHEN** evidence shows many small wrappers or helpers with weak reuse and inconsistent naming
- **THEN** the system may create an AI-slop candidate with caution about human design review

### Requirement: Domain drift candidates
The system SHALL identify mismatches between code structure, naming, and documented product/domain concepts when docs or context files are available.

#### Scenario: Context document conflicts with code naming
- **WHEN** repository docs describe a domain concept that is implemented under inconsistent or misleading code names
- **THEN** the system may create a domain drift candidate with references to both code and documentation evidence

