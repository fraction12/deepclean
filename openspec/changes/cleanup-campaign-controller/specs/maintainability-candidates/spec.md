## MODIFIED Requirements

### Requirement: Ranking rubric
The system SHALL rank candidates and PR opportunities using priority, provenance, confidence, impact, effort, risk, evidence quality, ownership clarity, test availability, review surface, behavior risk, and expected maintainability payoff.

#### Scenario: Candidate count and maintainability diverge
- **WHEN** a cleanup PR improves ownership, locality, tests, or navigability without materially reducing raw candidate count
- **THEN** Deepclean reports the opportunity as campaign progress when evidence or revalidation supports the quality improvement

### Requirement: Broad cluster detection
The system SHALL identify clusters and candidates that are too broad or ambiguous to hand directly to an agent.

#### Scenario: Candidate is not a PR yet
- **WHEN** a candidate describes architecture direction, shared transport redesign, product/security decisions, or a many-caller refactor without a safe slice
- **THEN** Deepclean does not classify it as a safe PR opportunity
- **AND** it emits the next safe action as tests-first, split-first, spec/design-first, backlog/design debt, or do-not-automate

## ADDED Requirements

### Requirement: Campaign target classification
The system SHALL classify candidates into campaign target buckets that describe the next decision, not just the detected smell.

#### Scenario: Candidate is classified for campaign control
- **WHEN** Deepclean evaluates latest candidates for next work
- **THEN** each relevant candidate contributes to one of: `safe-narrow-pr`, `tests-first`, `spec-design-first`, `bad-target`, `duplicate`, `backlog-design-debt`, `do-not-automate`, or `stop-campaign`

### Requirement: Duplicate opportunity suppression
The system SHALL suppress duplicate PR opportunities when multiple findings point at the same safe cleanup slice.

#### Scenario: Multiple findings share one PR boundary
- **WHEN** several candidates cite the same owned files, feature scope, and implementation direction
- **THEN** Deepclean emits one PR opportunity that references all target candidates
- **AND** duplicate candidates are kept as evidence/context rather than separate next-work recommendations
