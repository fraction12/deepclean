# review-synthesis Specification

## MODIFIED Requirements

### Requirement: Model synthesis uses evidence bundles
Deepclean SHALL use bounded, evidence-driven model synthesis to turn local discovery into validated cleanup candidates, clusters, and explanations while preserving provenance, privacy boundaries, reviewer rubrics, and strict rejection of unsupported findings.

#### Scenario: Area-based synthesis chunk planning is extracted
- **WHEN** the system splits broad whole-repository synthesis into scoped packets
- **THEN** the public planner preserves existing chunk IDs, titles, file references, selected evidence, selected features, selected candidates, and fallback behavior while delegating area grouping internals to a smaller helper module
