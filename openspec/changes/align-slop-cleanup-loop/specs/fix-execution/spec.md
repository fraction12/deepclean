# fix-execution Specification

## ADDED Requirements

### Requirement: Guarded fix targets auto-fixable slop
The system SHALL only mutate source through guarded fix/work flows for one bounded auto-fixable target with explicit verification and revalidation.

#### Scenario: Auto-fixable target is requested
- **WHEN** `deepclean fix <target> --mode guarded --apply` receives a target classified as auto-fixable
- **THEN** the system may generate and apply a bounded fix only after scope checks and required verification are present

#### Scenario: Non-auto-fixable target is requested
- **WHEN** `deepclean fix <target> --mode guarded --apply` receives agent-fixable, human-design-needed, review-only, or noisy slop
- **THEN** the system refuses mutation and explains the required next step
