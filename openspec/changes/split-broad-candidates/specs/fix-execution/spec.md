## MODIFIED Requirements

### Requirement: Broad candidate refusal
The system SHALL refuse applied fixes for broad or ambiguous architecture candidates unless a clean bounded slice is available.

#### Scenario: Broad candidate needs decomposition
- **WHEN** an agent runs `deepclean fix <broad-parent> --mode guarded --apply --verification "npm test" --json`
- **THEN** Deepclean refuses source mutation with `fix_target_needs_split` and instructs the agent to run `deepclean split <broad-parent>`

#### Scenario: Decomposed child is selected
- **WHEN** an agent runs `deepclean fix <child-candidate> --mode guarded --apply --verification "npm test" --json`
- **THEN** Deepclean treats the child as the bounded slice and proceeds through normal candidate-first fix gates

### Requirement: Fix outcome classification
The system SHALL classify fix attempts as `resolved`, `partially-resolved`, `still-open`, `superseded`, or `needs_human`.

#### Scenario: Child candidate no longer appears
- **WHEN** verification passes for a decomposed child candidate and a fresh scan no longer rediscovers that exact child
- **THEN** Deepclean may classify the child as resolved while leaving any broader parent follow-up visible separately
