## ADDED Requirements

### Requirement: Feature-scoped candidates
Deepclean SHALL connect maintainability candidates to mapped features when local evidence supports the assignment.

#### Scenario: Candidate is created from mapped evidence
- **WHEN** candidate generation uses evidence associated with feature IDs
- **THEN** the candidate includes affected feature IDs
- **AND** explains whether the risk sits in entrypoints, owned files, shared context, tests, or cross-feature boundaries.

#### Scenario: Candidate only has raw file metrics
- **WHEN** a candidate is supported only by local file size, function size, or structural metrics
- **THEN** Deepclean does not promote the candidate above feature-scoped candidates unless it also has evidence of risk, churn, test weakness, coupling, or broad blast radius.

### Requirement: Cross-feature boundary classification
Deepclean SHALL identify when a candidate is feature-local, shared-context, or cross-feature.

#### Scenario: Evidence spans multiple features
- **WHEN** evidence for a candidate involves entrypoints or owned files from multiple mapped features
- **THEN** the candidate records the cross-feature relationship and recommends a bounded slice or split rather than a broad theme by default.
