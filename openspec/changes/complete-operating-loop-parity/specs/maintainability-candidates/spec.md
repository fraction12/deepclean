## MODIFIED Requirements

### Requirement: Ranking rubric
The system SHALL rank findings and candidate observations using priority, provenance, confidence, impact, effort, risk, evidence quality, lifecycle state, revalidation freshness, baseline status, and actionability.

#### Scenario: Model and local candidates share priority
- **WHEN** a model-synthesized candidate and a local metric-derived candidate have the same priority and comparable confidence
- **THEN** the model-synthesized candidate is ranked first when it cites valid fresh evidence and has broader cleanup value

## ADDED Requirements

### Requirement: Stable candidate signatures
The system SHALL compute stable signatures from normalized category, title, evidence kinds, primary anchors, graph neighborhood, analyzer rule IDs, and source locations.

#### Scenario: Line numbers drift
- **WHEN** a file changes and a finding moves by a small line offset
- **THEN** Deepclean preserves the same stable finding identity if the signature still matches confidently

### Requirement: Identity confidence
The system SHALL assign confidence to identity matching decisions and avoid unsafe merges.

#### Scenario: Two concerns look similar
- **WHEN** two findings share a title but differ in primary evidence, anchors, or graph neighborhood
- **THEN** Deepclean keeps separate findings or records a possible relationship rather than merging them automatically

### Requirement: Superseded findings
The system SHALL represent findings that are replaced by a more accurate or broader finding.

#### Scenario: Revalidation finds broader root cause
- **WHEN** a narrow candidate is better represented by a new theme or finding
- **THEN** Deepclean marks the old finding as superseded and links it to the replacement

### Requirement: Baseline status
The system SHALL classify findings as new, existing, worsened, improved, fixed, or unknown relative to a baseline.

#### Scenario: CI compares to main
- **WHEN** a finding appears in both the current branch and baseline with equivalent signature and severity
- **THEN** Deepclean reports it as existing rather than new

### Requirement: Owner and review surface metadata
The system SHALL allow findings to carry optional owner, reviewer surface, module area, and category metadata.

#### Scenario: Report is filtered by surface
- **WHEN** an agent lists findings for the backend surface
- **THEN** Deepclean returns findings whose owner, path, reviewer, or module metadata matches that surface
