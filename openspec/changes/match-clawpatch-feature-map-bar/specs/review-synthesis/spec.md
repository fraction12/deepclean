## ADDED Requirements

### Requirement: Model-refined, not model-invented, feature maps
Deepclean SHALL use provider-assisted feature mapping only as refinement over deterministic map inputs.

#### Scenario: Provider invents unsupported feature ownership
- **WHEN** provider output claims a feature owns files that are not supported by deterministic path, import, test, command, or configured project-context evidence
- **THEN** Deepclean rejects or downgrades that ownership claim and records a validation diagnostic.

#### Scenario: Provider refines supported feature names
- **WHEN** provider output renames, merges, splits, or summarizes deterministic feature records while preserving supported files and evidence
- **THEN** Deepclean may persist the refinement with provider provenance.

### Requirement: Feature-bounded synthesis
Deepclean SHALL include feature-map context in synthesis prompts when accepting model-generated cleanup candidates.

#### Scenario: Synthesis receives feature context
- **WHEN** review synthesis runs after a feature map exists
- **THEN** synthesis receives affected feature IDs, entrypoints, owned files, shared context, tests, and verification commands for the bounded evidence bundle.
