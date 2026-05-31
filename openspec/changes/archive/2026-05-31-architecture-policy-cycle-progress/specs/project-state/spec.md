## MODIFIED Requirements

### Requirement: Config record
The system SHALL persist project configuration including enabled evidence adapters, provider settings, scan exclusions, report preferences, candidate caps, reviewer-pack settings, privacy settings, and optional architecture policy settings.

#### Scenario: Config is loaded
- **WHEN** an agent runs `deepclean scan`
- **THEN** the system loads the effective config from defaults, `.deepclean/config.json`, and explicit CLI flags

#### Scenario: Architecture policy is configured
- **WHEN** `.deepclean/config.json` contains architecture layers and import rules
- **THEN** Deepclean validates those settings before applying them to graph evidence
