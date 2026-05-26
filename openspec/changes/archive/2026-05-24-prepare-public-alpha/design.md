## Context

Deepclean has reached private-alpha capability:

- local evidence collection works across TS/JS/Python repositories
- Codex synthesis is read-only and evidence-grounded
- candidates, clusters, reports, and plans are persisted under `.deepclean/`
- Lightning ITB dogfood produced useful model findings

The same dogfood run also showed release blockers:

- local evidence can flood the candidate queue if uncapped
- broad clusters can become unusable handoff targets
- report output needs a clearer "start here" layer
- CLI flag placement is too strict for agent workflows
- install/release packaging is not yet proven

## Goals / Non-Goals

**Goals:**

- Make Deepclean installable and usable from a fresh repository.
- Preserve agent-first JSON behavior while improving human reports.
- Keep source mutation out of public alpha.
- Make privacy boundaries obvious and testable.
- Add release confidence through smoke tests and dogfood scorecards.
- Support optional custom reviewer rubrics without making default runs depend on local agent skills.

**Non-Goals:**

- No `fix`, patch, commit, push, or PR automation.
- No hosted service.
- No cloud-only provider requirement.
- No promise that every finding is correct or auto-actionable.
- No broad language expansion beyond the evidence engines already present.

## Decisions

### Decision: Public alpha remains report-first

Deepclean SHALL ship public-alpha as an investigation and handoff tool. It must not mutate application source code.

Rationale: The diagnostic product is valuable only if users trust the report. Fixing should come after dogfood proves candidate quality and handoff quality across real repositories.

### Decision: Installability is part of the product

The release is not ready until a user can install the package, run `deepclean --version`, initialize a repo, scan, report, and remove `.deepclean/` without special local setup beyond the documented Codex requirement for synthesis.

Rationale: A CLI that only works through `node dist/cli.js` is not ready for outside use.

### Decision: Reports must be opinionated

Reports SHALL present a start-here section, top themes, top candidates, and warnings for noisy or too-broad clusters before listing raw candidates.

Rationale: The Lightning ITB run showed that raw evidence quantity is not the same as useful prioritization.

### Decision: Built-in reviewer pack stays the default

Deepclean SHALL keep built-in reviewer rubrics as the default synthesis behavior. Custom reviewer paths may be configured, but default output must not depend on OpenClaw skills, local agent files, or a user's personal workspace.

Rationale: Public users need reproducible behavior.

### Decision: Dogfood scorecard gates public alpha

Before public alpha, Deepclean SHALL be dogfooded against a small matrix of messy repos and scored for candidate quality, report clarity, false positives, cluster usability, privacy behavior, and handoff usefulness.

Rationale: The product succeeds by producing reports that agents can act on, not merely by passing unit tests.

## Risks / Trade-offs

- [Risk] Candidate caps hide useful low-ranked findings. -> Mitigation: persist evidence separately and document caps/config.
- [Risk] Custom reviewer rubrics produce unreproducible reports. -> Mitigation: keep built-ins default and record reviewer provenance.
- [Risk] Public users expect fixes. -> Mitigation: make report-first positioning explicit in README, help, and generated reports.
- [Risk] Dogfood artifacts expose private code. -> Mitigation: save scorecards and summaries, not private source excerpts.

## Migration Plan

1. Add package metadata, CLI bin, version command, and install smoke tests.
2. Fix global flag parsing and update docs/examples.
3. Improve ranking, candidate caps, broad-cluster detection, and cluster splitting.
4. Improve report summaries and JSON schema for public-alpha report UX.
5. Add privacy/trust docs and reviewer-pack config.
6. Run dogfood matrix and record scorecards.
7. Publish only after typecheck, tests, build, OpenSpec validation, package smoke test, and dogfood scorecard pass.

## Open Questions

- Should the public package name be `deepclean`, `deepclean-ai`, or scoped under an organization?
- Should public alpha default `scan` include synthesis, or require explicit `--synthesize`?
- Should dogfood snapshots live in repo docs, ignored local artifacts, or a separate private review folder?
- What minimum Codex CLI version should be documented?
