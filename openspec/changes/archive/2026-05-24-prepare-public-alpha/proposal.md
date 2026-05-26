## Why

Deepclean is now useful as a private-alpha tool, but the Lightning ITB dogfood run exposed the gap between "works on my machine" and "safe for other people to install and trust." The core investigation loop exists, but public users need installable packaging, predictable CLI behavior, clearer reports, stricter noise controls, privacy documentation, and repeatable release checks.

This change prepares Deepclean for a public-alpha release without expanding into automated fixing. The product should remain report-first until the diagnostic surface is reliable.

## What Changes

- Make the CLI installable and smoke-testable through normal package workflows.
- Fix global option ergonomics so agents can place flags before or after the command.
- Add version/help output suitable for users and automation.
- Harden candidate ranking, local evidence caps, and cluster splitting so reports are actionable instead of flooded by raw metrics.
- Improve report shape around top themes, top candidates, start-here guidance, broad-cluster warnings, and plan links.
- Add release documentation for privacy, local Codex usage, data sent to model prompts, source mutation boundaries, and `.deepclean/` state.
- Add configurable reviewer-pack support while keeping built-in reviewer defaults reproducible.
- Establish a dogfood scorecard and release checklist for public-alpha readiness.

## Capabilities

### New Capabilities

- `release-readiness`: Packaging, smoke tests, CI/release checklist, dogfood scorecard, changelog, license, and npm publish preparation.

### Modified Capabilities

- `agent-first-cli`: Improve global flag handling, version/help behavior, install ergonomics, and command examples.
- `maintainability-candidates`: Tighten candidate caps, ranking, and noise controls.
- `reporting-and-handoff`: Improve report summaries, plan links, warnings, and start-here guidance.
- `project-state`: Document and validate public-alpha state compatibility and privacy-safe persistence.
- `review-synthesis`: Add configurable reviewer pack support without weakening reproducibility or evidence validation.

## Impact

- CLI argument parser and package metadata.
- README, privacy docs, release docs, and changelog/license files.
- Candidate ranking and cluster-building behavior.
- Report rendering and JSON report schema additions.
- Config schema for reviewer-pack controls.
- Dogfood artifacts under a repo-local, non-source test fixture or docs path.

No application source mutation, patch application, commits, branch pushes, or PR creation are introduced by this change.
