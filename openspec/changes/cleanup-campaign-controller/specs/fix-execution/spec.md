## MODIFIED Requirements

### Requirement: Broad candidate refusal
The system SHALL refuse applied fixes for broad, ambiguous, or non-PR campaign targets unless a clean bounded PR opportunity is available.

#### Scenario: Target is not a safe PR opportunity
- **WHEN** an agent runs `deepclean fix <target> --mode guarded --apply --verification "npm test" --json` for a target classified as tests-first, spec-design-first, bad-target, backlog-design-debt, do-not-automate, duplicate, or stop-campaign
- **THEN** Deepclean refuses source mutation with a policy diagnostic that explains the required next action

#### Scenario: Safe opportunity is selected
- **WHEN** an agent runs `deepclean fix <opportunity-id> --mode guarded --apply --verification "npm test" --json` for a `safe-narrow-pr` opportunity
- **THEN** Deepclean uses the opportunity write scope, do-not-touch list, validation plan, and stop line as fix execution gates

### Requirement: Fix outcome classification
The system SHALL classify fix attempts as `resolved`, `partially-resolved`, `still-open`, `superseded`, or `needs_human` and connect that outcome back to the target PR opportunity when one exists.

#### Scenario: Opportunity partially improves hotspot
- **WHEN** verification passes and revalidation shows metric or locality progress but related debt remains
- **THEN** Deepclean may classify the opportunity as completed or partially resolved while leaving follow-up design/backlog debt visible separately
