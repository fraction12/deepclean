## ADDED Requirements

### Requirement: Beta workflow help
The system SHALL include CLI help examples for the core beta workflow.

#### Scenario: User asks for command help
- **WHEN** a user runs `deepclean --help` or command-specific help
- **THEN** help text points to doctor, scan, status, report, next, show, plan, handoff, revalidate, and guarded fix examples where available
