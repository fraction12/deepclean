## MODIFIED Requirements

### Requirement: Scriptable command surface
The system SHALL provide an agent-first CLI workflow with `init`, `scan`, `report`, `next`, `show`, `triage`, `handoff` or `export`, `fix`, `work`, `split`, `review-pr`, `ci`, and `campaign` commands. Commands that can mutate source, branches, pull requests, or candidate state SHALL require explicit command invocation and structured prerequisites.

#### Scenario: Agent asks for next cleanup work
- **WHEN** an agent runs `deepclean next --json`
- **THEN** Deepclean returns the next recommended PR opportunity rather than only the highest-ranked raw candidate
- **AND** the response includes backward-compatible primary candidate data when the opportunity maps to a candidate

#### Scenario: Agent asks whether campaign should continue
- **WHEN** an agent runs `deepclean campaign --json`
- **THEN** Deepclean emits a read-only campaign summary with opportunity counts, current recommendation, stop-campaign rationale when applicable, and remaining work buckets

#### Scenario: Agent plans an opportunity
- **WHEN** an agent runs `deepclean plan <opportunity-id> --json`
- **THEN** Deepclean emits an opportunity plan with target files, do-not-touch files, behavior invariants, validation plan, expected reviewer concern, and stop line

#### Scenario: Agent reviews a PR against a target
- **WHEN** an agent runs `deepclean review-pr --target <opportunity-id> --base <ref> --head <ref> --json`
- **THEN** Deepclean emits source-safe PR review context and a target verdict without publishing to GitHub

#### Scenario: Agent runs a quality gate
- **WHEN** an agent runs `deepclean ci --profile balanced --baseline <ref> --json`
- **THEN** Deepclean emits a quality gate result with blockers, advisories, regressions, improvements, selected profile, baseline reference, and analyzer provenance

### Requirement: Stable machine contracts
The system SHALL expose stable JSON contracts that review agents, campaign controllers, and release tooling can consume without reading implementation internals.

#### Scenario: Agent discovers campaign contracts
- **WHEN** an agent runs `deepclean schemas --json`
- **THEN** the command includes documented contracts for PR opportunities, campaign summaries, quality profiles, quality gate results, and opportunity-aware `next` output once those contracts are marked stable or guarded

### Requirement: Predictable exit behavior
The system SHALL use predictable exit codes and structured diagnostics for success, partial success, validation failure, configuration failure, policy refusal, verification failure, no-safe-opportunity, and unexpected errors.

#### Scenario: No safe opportunity remains
- **WHEN** `deepclean next --json` finds no safe implementation PR
- **THEN** the command exits successfully and returns a `stop-campaign` opportunity with classification counts rather than failing as an empty candidate queue
