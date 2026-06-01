## MODIFIED Requirements

### Requirement: Fix-readiness metadata
The system SHALL capture bounded fix-readiness and campaign-readiness metadata for synthesized candidates.

#### Scenario: Synthesized candidate is accepted
- **WHEN** review synthesis accepts a model-generated candidate
- **THEN** the candidate records minimum fix scope, suggested regression test, why current tests may miss the issue, confidence downgrade reasons, likely ownership boundary, do-not-touch files, expected behavior invariants, and non-goals when available

### Requirement: Evidence-grounded synthesis
The system MUST NOT persist a model-generated candidate or PR opportunity unless it cites supporting evidence IDs or explicit source/document excerpts captured in the evidence bundle.

#### Scenario: Model suggests unsupported opportunity
- **WHEN** the model returns a plausible PR recommendation without cited evidence, file anchors, or validation rationale
- **THEN** the system rejects or downgrades it to a diagnostic rather than saving it as a safe PR opportunity

## ADDED Requirements

### Requirement: Campaign judgment synthesis
The system SHALL use synthesis to improve campaign judgment only within evidence-bounded scopes.

#### Scenario: Model classifies target readiness
- **WHEN** synthesis evaluates a candidate or chunk for PR opportunity readiness
- **THEN** it must distinguish implementation-ready slices from tests-first, spec/design-first, bad-target, duplicate, backlog/design debt, and do-not-automate targets
- **AND** it must explain the classification using cited evidence and repository-local context

### Requirement: Sensitive-scope refusal
The system SHALL let synthesis recommend refusal when a target needs product, security, auth, public API, shared transport, multi-tenancy, payment, pricing, or workflow design judgment.

#### Scenario: Target crosses sensitive scope
- **WHEN** evidence indicates a candidate touches sensitive or product-semantic scope
- **THEN** synthesis may classify the item as not safe for autonomous implementation
- **AND** Deepclean persists that judgment as campaign guidance rather than an open safe PR opportunity

### Requirement: Quality signal classification
The system SHALL classify external analyzer and model-supported quality signals without pretending Deepclean owns every specialized analyzer.

#### Scenario: Analyzer finding is reviewed by synthesis
- **WHEN** synthesis receives SARIF, Semgrep, jscpd, dependency, or test-proof evidence
- **THEN** it may explain whether the signal is a security blocker, bug-risk blocker, maintainability opportunity, false-positive candidate, duplicate signal, or advisory
- **AND** the persisted blocker/advisory must cite the analyzer evidence and rule/source metadata
