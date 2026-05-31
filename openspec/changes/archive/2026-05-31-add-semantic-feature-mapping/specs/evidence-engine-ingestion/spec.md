## ADDED Requirements

### Requirement: Local feature mapping
Deepclean SHALL map local files into semantic work units before or during evidence-driven analysis.

#### Scenario: Supported local feature kinds
- **WHEN** a repository contains package scripts, TS/JS source, Python source, tests, or common config files
- **THEN** Deepclean emits matching feature records for package scripts, modules/components/routes, Python modules/routes, test suites, and config.

#### Scenario: Scoped scan maps scoped features
- **WHEN** `deepclean scan --paths <path> --json` runs
- **THEN** generated source-backed features are limited to the scanned file scope.
