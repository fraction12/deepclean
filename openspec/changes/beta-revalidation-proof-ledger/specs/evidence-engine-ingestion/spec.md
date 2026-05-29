## ADDED Requirements

### Requirement: Revalidation evidence bundles
The system SHALL collect the minimum evidence needed to determine whether a finding remains true.

#### Scenario: Finding primary file changed
- **WHEN** `deepclean revalidate <id>` runs for a finding whose primary file changed
- **THEN** Deepclean recollects evidence for the primary anchors, related graph neighborhood, and cited analyzer facts

### Requirement: Evidence freshness
The system SHALL track whether evidence was collected in the latest run, inherited from baseline, reused for revalidation, or stale.

#### Scenario: Report includes reused evidence
- **WHEN** a report cites evidence that was not freshly collected in the current run
- **THEN** the JSON output identifies the evidence freshness and originating run
