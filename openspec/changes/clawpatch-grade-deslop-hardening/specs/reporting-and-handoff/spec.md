## ADDED Requirements

### Requirement: Strong finding queue
The system SHALL prefer strong model-synthesized findings and bounded themes over weak one-metric local findings in report recommendations.

#### Scenario: Model and metric findings exist
- **WHEN** a report includes both valid model-synthesized candidates and local metric candidates
- **THEN** the start-here recommendation and top candidate queue prefer the model-synthesized candidates unless a higher-severity local finding is the only actionable choice

### Requirement: Deduped agent plans
The system SHALL dedupe and cap file references in generated plans.

#### Scenario: Theme contains repeated file references
- **WHEN** `deepclean plan <theme-id>` generates a plan for a theme with repeated candidate files
- **THEN** the rendered plan lists each file range at most once per plan section and caps broad file lists to keep the packet agent-readable
