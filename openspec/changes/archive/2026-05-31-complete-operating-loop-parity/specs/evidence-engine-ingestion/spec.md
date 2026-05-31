## ADDED Requirements

### Requirement: Incremental evidence scopes
The system SHALL collect evidence for incremental scopes defined by git refs, merge-base, dirty working tree changes, explicit paths, categories, and reviewer surfaces.

#### Scenario: Agent scans changes since main
- **WHEN** an agent runs `deepclean scan --since main --include-dirty --json`
- **THEN** Deepclean records the changed scope, collects relevant local evidence for that scope, and preserves enough surrounding context for ranking and synthesis

### Requirement: Baseline-aware evidence
The system SHALL preserve the relationship between current evidence and baseline evidence for CI and revalidation.

#### Scenario: Existing debt appears in baseline
- **WHEN** a finding is present before the scanned change range
- **THEN** Deepclean can report it as existing debt rather than a new finding introduced by the current change

### Requirement: Revalidation evidence bundles
The system SHALL collect the minimum evidence needed to determine whether a finding remains true.

#### Scenario: Finding primary file changed
- **WHEN** `deepclean revalidate <id>` runs for a finding whose primary file changed
- **THEN** Deepclean recollects evidence for the primary anchors, related graph neighborhood, and cited analyzer facts

### Requirement: Dirty tree evidence marking
The system SHALL mark evidence collected from uncommitted working-tree changes.

#### Scenario: Agent includes dirty changes
- **WHEN** an agent runs `deepclean scan --include-dirty --json`
- **THEN** evidence derived from uncommitted files is marked with dirty-tree provenance

### Requirement: Evidence freshness
The system SHALL track whether evidence was collected in the latest run, inherited from baseline, reused for revalidation, or stale.

#### Scenario: Report includes reused evidence
- **WHEN** a report cites evidence that was not freshly collected in the current run
- **THEN** the JSON output identifies the evidence freshness and originating run
