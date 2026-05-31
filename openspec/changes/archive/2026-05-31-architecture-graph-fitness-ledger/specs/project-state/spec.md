## MODIFIED Requirements

### Requirement: Revalidation proof records
The system SHALL persist revalidation records with target finding, evidence bundle, verification links, outcome, confidence, rationale, replacement link, next action, and measurable progress when a supported fitness metric improves.

#### Scenario: Finding is revalidated after a fix
- **WHEN** revalidation completes
- **THEN** Deepclean writes a proof record that explains whether the original finding is resolved, partially-resolved, still-open, superseded, stale, inconclusive, or needs-human

#### Scenario: Finding improves without disappearing
- **WHEN** revalidation observes a supported line-count or dependency-pressure reduction
- **THEN** Deepclean persists the before value, after value, delta, metric, unit, and evidence IDs as progress proof
