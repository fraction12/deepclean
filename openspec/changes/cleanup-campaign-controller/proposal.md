# Cleanup Campaign Controller

## Why

Deepclean is already useful as a repo health radar: it finds concentrated maintainability hot spots, groups related evidence, labels design-heavy areas, and can confirm after a scoped scan whether a local area improved.

The long-running dogfood failure mode is not detection. The expensive part is campaign judgment:

- choosing the next safe PR,
- setting the stop line,
- refusing attractive but bad targets,
- deciding when tests/spec/design must happen first,
- rechecking the affected scope after merge,
- and knowing when the remaining work is backlog/design debt rather than obvious cleanup.

Candidate count is the wrong primary scoreboard. A campaign can materially improve maintainability while raw findings barely move because complexity was moved into a legitimate shared module, an overloaded file was split into owned modules, or ambiguous debt was classified instead of blindly refactored.

Deepclean should control the cleanup campaign like a senior engineer: recommend one safe, high-leverage PR opportunity at a time, say where to stop, refuse work that is not a PR yet, and judge whether the repo or PR is getting cleaner against explicit quality gates.

## What Changes

- Add a first-class `pr_opportunity` record derived from candidates, clusters, feature ownership, evidence, lifecycle state, test availability, revalidation history, and fix attempts.
- Rework `deepclean next` from "highest-ranked open candidate" into "next safest, highest-leverage PR opportunity", while retaining raw candidate data for compatibility.
- Add target classifications that route findings into `safe-narrow-pr`, `tests-first`, `spec-design-first`, `bad-target`, `duplicate`, `backlog-design-debt`, and `do-not-automate`.
- Generate explicit stop lines for every opportunity: files to touch, files not to touch, behavior invariants, validation plan, expected reviewer concern, and when to stop expanding.
- Rework plans and handoffs so agents receive an opportunity packet, not just a smell description.
- Extend PR review context so a branch can be checked against the target opportunity: did it stay in scope, preserve behavior, improve the intended hotspot, and avoid creating new smells?
- Add a campaign summary that reports outcome quality: merged/fix-attempt PRs when known, hotspot severity reduced, responsibility splits, tests added, ambiguous findings classified, and remaining design/backlog debt.
- Add first-class code quality profiles and gates that combine Deepclean maintainability evidence with optional external analyzer evidence for security, bug risk, dependency risk, duplication, test coverage/proof, and policy violations.
- Ensure quality gates are useful with zero external scanner setup by evaluating Deepclean's built-in repo evidence first, then marking specialized security/dependency/coverage assurance as missing or partial when no analyzer is configured.
- Add analyzer discovery/setup guidance so users can optionally wire in sensible starter analyzers for their stack without making Deepclean depend on those tools on day one.
- Rework `deepclean ci` from a thin candidate-count gate into a quality gate runner that can enforce explicit profiles, compare against a baseline, emit SARIF/Markdown/JSON, and distinguish hard blockers from advisory cleanup opportunities.

## Non-Goals

- Do not add fully autonomous repo-wide refactoring.
- Do not optimize for driving candidate count to zero.
- Do not make Deepclean own external GitHub publishing, branch deletion, or CI waiting loops in this change.
- Do not automate auth/security, multi-tenancy/org scoping, payment/pricing semantics, public API behavior, cross-cutting shared transport layers, or product workflows without tests/specs.
- Do not replace dedicated scanners such as Semgrep, CodeQL, npm audit, test coverage tools, or language-specific linters; Deepclean should ingest their source-safe outputs and make campaign/CI decisions from normalized evidence.
- Do not require users to configure external scanners before Deepclean can produce a useful cleanup or PR quality verdict.
- Do not remove existing evidence, candidate, cluster, finding, plan, handoff, fix, or review-pr records; the campaign controller composes them.

## Success Bar

After a whole-repo scan, this should be the default agent loop:

```bash
deepclean scan
deepclean next --json
deepclean plan <opportunity-id>
deepclean handoff <opportunity-id> --format codex
# agent opens/merges a PR outside Deepclean or through existing guarded work
deepclean review-pr --target <opportunity-id> --base main --head HEAD --json
deepclean ci --profile balanced --baseline origin/main --sarif .deepclean/ci/deepclean.sarif --json
deepclean setup analyzers --json # optional: strengthen gates with stack-specific scanners
deepclean scan --paths <changed-scope>
deepclean campaign --json
deepclean next --json
```

The valuable outcome is not "fewer candidates." The valuable outcome is:

- good cleanup PRs landed,
- no PRs left hanging,
- CI/actionable review feedback handled,
- main clean,
- remaining findings classified as backlog/design/test/spec work rather than obvious safe cleanup,
- PR quality gates pass or clearly explain new blockers,
- and the next recommendation is either a specific PR opportunity or a clear stop.

## Capabilities

### New Capabilities

- `cleanup-campaign-control`: Select, explain, persist, and review PR opportunities for a cleanup campaign.
- `code-quality-gates`: Evaluate repository and PR quality profiles across maintainability, security, bug risk, dependency risk, duplication, tests/proof, and policy signals.
- `analyzer-setup`: Detect available project/tooling signals and recommend optional external analyzer setup for stronger quality gates.

### Modified Capabilities

- `agent-first-cli`: `next`, `plan`, `handoff`, `report`, `review-pr`, and a new `campaign` surface expose opportunity-aware workflows.
- `maintainability-candidates`: candidates receive campaign classifications and can be marked as non-PR targets without being lost.
- `project-state`: `.deepclean/` persists PR opportunities and campaign summaries.
- `reporting-and-handoff`: reports and handoffs prioritize opportunity packets over raw candidate queues.
- `review-synthesis`: synthesis and validation provide the fields needed for PR-opportunity judgment.
- `fix-execution`: guarded work refuses targets that are not safe PR opportunities.
- `release-readiness`: CI/release gates can consume Deepclean quality profiles instead of only candidate-count thresholds.

## Impact

- New opportunity selection module, likely `src/opportunities.ts`.
- New campaign summary module, likely `src/campaign.ts`.
- Candidate/finding/report/plan/handoff/review-pr schemas expand.
- CI run records gain quality profile, gate results, baseline delta, blocker/advisory severity, and analyzer provenance.
- State paths/read/write gain `opportunities/` and `campaigns/` artifact stores.
- `deepclean next` changes behavior but keeps backward-compatible candidate fields.
- `deepclean ci` changes behavior but keeps backward-compatible candidate-threshold flags by translating them into an ad hoc quality profile.
- `deepclean setup analyzers` may be added as a dry-run-first helper for analyzer discovery and setup recommendations.
- Tests need to cover good target selection, bad target refusal, tests-first routing, stop lines, opportunity plan/handoff content, PR review against a target, quality profile evaluation with and without analyzer evidence, baseline comparison, analyzer setup diagnostics, and SARIF/CI output.
