## ADDED Requirements

### Requirement: Clawpatch-style synthesis posture
The system SHALL use model synthesis as evidence-backed judgment over mapped repository surfaces, not as a freeform codebase review.

#### Scenario: Graph evidence is weak
- **WHEN** local graph evidence has no local edges
- **THEN** synthesis may use other evidence but MUST NOT promote graph-coupling claims unless supported by another valid evidence ID

#### Scenario: Graph evidence is strong
- **WHEN** local graph evidence contains valid local edges and hotspots
- **THEN** synthesis may cite graph evidence to propose architecture or dependency cleanup candidates
