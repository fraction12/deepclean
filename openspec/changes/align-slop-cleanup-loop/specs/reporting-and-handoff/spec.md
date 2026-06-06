# reporting-and-handoff Specification

## MODIFIED Requirements

### Requirement: Report content
The system SHALL include candidate ID, title, category, priority, confidence, impact, effort, risk, files, evidence summary, why it matters, likely root cause, suggested direction, verification path, report warnings, start-here guidance, slop type, and fixability in detailed reports.

#### Scenario: Agent inspects report JSON
- **WHEN** an agent runs `deepclean report --json`
- **THEN** the report includes enough recommendation, warning, artifact path, slop/fixability summary, and candidate metadata for prioritization without requiring source-code mutation

## ADDED Requirements

### Requirement: Slop actionability summary
The system SHALL summarize report findings by fixability before presenting raw candidate queues.

#### Scenario: Report includes mixed cleanup work
- **WHEN** report generation sees auto-fixable, agent-fixable, human-design-needed, review-only, or noisy findings
- **THEN** the report shows counts and representative target IDs for each fixability bucket

### Requirement: Slop cleanup brief
The system SHALL make Markdown reports read as a cleanup brief that routes slop before showing raw implementation detail.

#### Scenario: Human opens a Markdown report
- **WHEN** a report includes mixed opportunities, themes, and candidates
- **THEN** the report leads with what to do next, grouped auto-fixable slop, agent-fixable slop, human-design-needed work, review-only findings, and likely noise
- **AND** raw opportunity, theme, feature, and candidate detail appears only after the cleanup brief as appendices

### Requirement: Handoff respects fixability
The system SHALL include fixability in handoff guidance so agents know whether mutation is expected, bounded, or blocked.

#### Scenario: Handoff is generated for non-auto-fixable slop
- **WHEN** an agent runs `deepclean handoff <target>`
- **THEN** the handoff packet explains why the target is agent-fixable, human-design-needed, review-only, or noise instead of presenting it as a safe unattended fix
