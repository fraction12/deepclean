## ADDED Requirements

### Requirement: Quality profile model
The system SHALL model code quality policy as explicit profiles rather than hard-coded candidate-count checks.

#### Scenario: Built-in profile is selected
- **WHEN** an agent runs `deepclean ci --profile balanced --json`
- **THEN** Deepclean evaluates the built-in balanced profile across maintainability, security, bug risk, dependency risk, duplication, test/proof, and policy gates
- **AND** the result identifies which gates are blocking versus advisory

#### Scenario: Legacy threshold flags are used
- **WHEN** an agent runs `deepclean ci --max-new-p1 0 --fail-category testability --json`
- **THEN** Deepclean translates those flags into an ad hoc quality profile
- **AND** existing CI behavior remains backward-compatible unless a named profile is explicitly selected

### Requirement: Built-in quality evidence without external scanners
The system SHALL produce useful quality gate results from Deepclean's own repository evidence even when no external scanner output is present.

#### Scenario: No external analyzer evidence exists
- **WHEN** an agent runs `deepclean ci --profile balanced --json` in a repository with no configured SARIF, Semgrep, CodeQL, npm audit, coverage, or duplication scanner output
- **THEN** Deepclean evaluates built-in maintainability, churn, dependency graph, duplication approximation, test/proof availability, PR scope, and policy signals
- **AND** the result clearly marks security, dependency vulnerability, and language-specialized correctness gates as `not-configured` or advisory rather than silently pretending they were checked
- **AND** the result remains actionable without requiring the user to install another scanner first

#### Scenario: Built-in signals find a blocker
- **WHEN** Deepclean's own evidence identifies a new P0/P1 maintainability regression, changed do-not-touch file, missing required verification, unsafe PR scope, high-risk hotspot expansion, or tests-first target
- **THEN** a blocking profile may fail the quality gate without needing external analyzer evidence
- **AND** the blocker cites Deepclean evidence IDs, candidate IDs, finding IDs, review-pr verdicts, or opportunity IDs

#### Scenario: Specialized assurance is missing
- **WHEN** a selected profile includes security, dependency vulnerability, coverage, or language-specific correctness gates that require an external analyzer
- **THEN** Deepclean reports the gate coverage as missing or partial
- **AND** the result explains the exact analyzer class needed instead of presenting the gate as passed

### Requirement: External analyzer evidence as input
The system SHALL use external analyzers as evidence providers rather than reimplementing their specialized analysis.

#### Scenario: SARIF evidence exists
- **WHEN** Semgrep, CodeQL, npm audit, or another configured analyzer emits SARIF or equivalent source-safe output
- **THEN** Deepclean normalizes the result into evidence with analyzer provenance, rule ID, severity, confidence, and file location
- **AND** quality gates may classify the result as a blocker or advisory according to the selected profile

#### Scenario: Analyzer is unavailable
- **WHEN** an optional analyzer cannot run or its output is missing
- **THEN** Deepclean records a structured diagnostic
- **AND** the quality gate result states whether the missing analyzer is advisory or blocking under the selected profile

### Requirement: Analyzer discovery and starter setup
The system SHALL help users add external analyzers when they want stronger gates, while keeping analyzer setup optional.

#### Scenario: Analyzer setup is requested
- **WHEN** an agent runs `deepclean setup analyzers --json`
- **THEN** Deepclean detects the repository ecosystem, package manager, existing scripts, CI provider files, and already configured scanners
- **AND** it returns a source-safe setup plan with recommended starter analyzers, commands, expected outputs, and files that would need changes
- **AND** it defaults to dry-run behavior unless the user explicitly asks to write config

#### Scenario: JavaScript or TypeScript starter setup is requested
- **WHEN** the repository is detected as JavaScript or TypeScript
- **THEN** Deepclean recommends a starter analyzer set based on available project signals, such as typecheck, existing tests, npm audit, Semgrep, duplication detection, and coverage only when coverage tooling already exists or can be configured safely
- **AND** Deepclean records which recommendations are immediately runnable, which require installation, and which should stay advisory

#### Scenario: Quality gate sees missing recommended analyzers
- **WHEN** `deepclean ci --profile balanced --json` runs without configured analyzers that the repository setup plan recommends
- **THEN** Deepclean includes setup recommendations in diagnostics
- **AND** it does not fail the gate solely because optional recommended analyzers have not been installed unless the selected profile declares them required

### Requirement: Baseline-aware quality gates
The system SHALL compare current quality signals against a baseline when a baseline reference is available.

#### Scenario: New severe issue appears
- **WHEN** a PR introduces a new high-severity security, correctness, test-proof, or maintainability blocker relative to the baseline
- **THEN** Deepclean marks the quality gate result as failed for blocking profiles
- **AND** existing unresolved debt remains visible as backlog unless the profile explicitly blocks existing issues

#### Scenario: Cleanup improves without reaching zero debt
- **WHEN** a PR reduces hotspot severity, removes a cycle, adds missing proof, or suppresses a false positive with evidence
- **THEN** Deepclean records the improvement in the quality gate result even if other legacy findings remain

### Requirement: PR-target quality verdict
The system SHALL combine PR opportunity verdicts with quality gate evaluation.

#### Scenario: PR is out of scope for target
- **WHEN** `deepclean review-pr --target <opportunity-id>` reports `wrong-target`, `too-broad`, changed do-not-touch files, or missing required verification
- **THEN** `deepclean ci --profile balanced` treats the PR as a quality gate failure
- **AND** the gate result explains the target verdict and cites the target opportunity

#### Scenario: PR partially addresses target
- **WHEN** a PR partially improves the target opportunity but leaves follow-up design debt
- **THEN** Deepclean records the improvement and remaining debt separately
- **AND** the selected profile decides whether partial progress is advisory or blocking

### Requirement: Source-safe CI artifacts
The system SHALL emit CI artifacts that are useful to review systems without exposing private source excerpts by default.

#### Scenario: CI artifacts are requested
- **WHEN** an agent runs `deepclean ci --profile balanced --output <path> --sarif <path> --json`
- **THEN** Deepclean writes JSON, Markdown, and SARIF artifacts containing blockers, advisories, regressions, improvements, file locations, rule IDs, evidence IDs, profile ID, baseline reference, and analyzer provenance
- **AND** the artifacts avoid private source excerpts unless source-sharing has been explicitly enabled
