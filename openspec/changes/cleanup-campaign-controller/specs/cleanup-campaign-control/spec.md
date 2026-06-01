## ADDED Requirements

### Requirement: PR opportunity model
The system SHALL model cleanup campaign work as PR opportunities derived from evidence, candidates, clusters, feature ownership, finding lifecycle, revalidation, and fix-attempt history.

#### Scenario: Opportunity is created from a safe candidate
- **WHEN** a candidate has a clear ownership boundary, nearby tests or verification, low behavior risk, bounded file scope, and meaningful hotspot payoff
- **THEN** Deepclean creates a `pr_opportunity` record with `classification = "safe-narrow-pr"`
- **AND** the opportunity cites the target candidate/finding/evidence IDs that justify the recommendation

#### Scenario: Opportunity refuses a bad target
- **WHEN** a candidate is important-looking but lacks a clear ownership boundary, would touch too many callers, has thin tests, or has mostly aesthetic payoff
- **THEN** Deepclean classifies it as `bad-target`, `tests-first`, `spec-design-first`, `backlog-design-debt`, or `do-not-automate`
- **AND** the classification includes a refusal reason rather than presenting it as the next implementation PR

### Requirement: Stop-line guidance
The system SHALL include explicit boundary-setting guidance for every safe PR opportunity.

#### Scenario: Agent receives an opportunity
- **WHEN** Deepclean recommends a `safe-narrow-pr` opportunity
- **THEN** the opportunity includes files to touch, files not to touch, behavior invariants, validation plan, expected reviewer concern, expected payoff, and a stop line
- **AND** the stop line explains what work is intentionally out of scope for the PR

### Requirement: Campaign stop state
The system SHALL identify when the cleanup campaign should stop because remaining findings require judgment, tests, specs, design, or product/security decisions rather than mechanical refactor.

#### Scenario: No safe PR opportunities remain
- **WHEN** all current candidates are classified as tests-first, spec-design-first, backlog/design debt, bad target, duplicate, do-not-automate, resolved, stale, suppressed, or superseded
- **THEN** Deepclean emits a `stop-campaign` opportunity
- **AND** the rationale explains why the remaining work is not obvious safe cleanup

### Requirement: Outcome-oriented campaign metrics
The system SHALL report campaign progress using outcome quality signals rather than raw candidate count as the primary measure.

#### Scenario: Campaign summary is generated
- **WHEN** Deepclean builds a campaign summary
- **THEN** the summary prioritizes safe PR opportunities completed or available, hotspot severity reduced, graph pressure reduced when supported by evidence, responsibility splits, tests added or required, ambiguous findings classified, and remaining design/test/spec debt
- **AND** raw candidate counts appear only as supporting context

### Requirement: Bad automation guardrails
The system SHALL prevent campaign automation from treating sensitive or ambiguous domains as autonomous refactor targets.

#### Scenario: Sensitive target is detected
- **WHEN** a candidate affects auth/security boundaries, multi-tenancy or org scoping, payment or pricing semantics, public API behavior, cross-cutting shared transport, product workflows without a spec, or behavior inferred without tests
- **THEN** Deepclean classifies the target as `spec-design-first`, `tests-first`, or `do-not-automate`
- **AND** guarded fix/work execution refuses the target as an applied implementation job
