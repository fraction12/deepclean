## 1. Packaging And Installability

- [x] 1.1 Add package metadata needed for public alpha: `bin`, `files`, `license`, repository/homepage fields, and package description.
- [x] 1.2 Add `deepclean --version` and ensure `deepclean --help` works without a command.
- [x] 1.3 Verify `npm pack` contains only intended files and no `.deepclean/`, local artifacts, or private reports.
- [x] 1.4 Add a package smoke test that installs the packed tarball globally or into a temp project and runs `deepclean --version`, `deepclean init`, `deepclean scan --json`, and `deepclean report --json`.
- [x] 1.5 Document fresh-install quickstart for users with and without Codex synthesis.

## 2. CLI Ergonomics

- [x] 2.1 Support global flags before or after the command, including `deepclean --root <repo> scan --synthesize`.
- [x] 2.2 Ensure all documented examples use the installable `deepclean` command rather than `node dist/cli.js`.
- [x] 2.3 Add tests for global flag placement, unknown command handling, and non-interactive behavior.
- [x] 2.4 Add clear diagnostics when Codex is missing, old, unauthenticated, or times out.

## 3. Noise Control And Ranking

- [x] 3.1 Make local evidence candidate caps configurable by kind and module area.
- [x] 3.2 Keep model-synthesized candidates ranked ahead of raw metric findings at the same priority when confidence and evidence support are strong.
- [x] 3.3 Detect broad clusters and mark them as too broad rather than handing them to agents as actionable plans.
- [x] 3.4 Split broad clusters by module area, graph neighborhood, category, or reviewer surface where possible.
- [x] 3.5 Add tests for candidate caps, model-first ranking, broad-cluster warnings, and cluster splitting.

## 4. Report And Handoff UX

- [x] 4.1 Add a report "Start Here" section with the top recommended candidate or cluster and the reason.
- [x] 4.2 Add top cleanup themes before the raw candidate list.
- [x] 4.3 Add warnings for noisy runs, broad clusters, missing Codex synthesis, partial evidence, and unavailable adapters.
- [x] 4.4 Include generated plan paths or plan suggestions for top candidates and bounded clusters.
- [x] 4.5 Improve JSON report schema so agents can read recommendations, warnings, artifact paths, and report quality diagnostics directly.
- [x] 4.6 Add report snapshot tests from fixture repositories.

## 5. Reviewer Pack Configuration

- [x] 5.1 Add config fields for enabled built-in reviewers and optional custom reviewer rubric paths.
- [x] 5.2 Validate custom reviewer paths and fail safely when they are missing, unreadable, or malformed.
- [x] 5.3 Record reviewer-pack provenance in synthesis metadata and reports.
- [x] 5.4 Keep built-in reviewer rubrics as the default and document that OpenClaw skills are not dynamically loaded.

## 6. Privacy, Safety, And Trust Docs

- [x] 6.1 Document exactly what data is sent to local Codex synthesis by default.
- [x] 6.2 Document `--allow-source-in-model`, its risks, and when it is appropriate.
- [x] 6.3 Document that Deepclean does not mutate application source and writes only under `.deepclean/` during public alpha.
- [x] 6.4 Add `.gitignore` guidance for `.deepclean/` artifacts and private reports.
- [x] 6.5 Add troubleshooting docs for Codex auth, missing git history, large repos, and noisy reports.

## 7. Dogfood Scorecard

- [x] 7.1 Define a dogfood scorecard covering false positives, evidence strength, ranking quality, cluster usability, report readability, privacy behavior, and handoff readiness.
- [x] 7.2 Dogfood against Deepclean itself and save a scorecard.
- [x] 7.3 Dogfood against Lightning ITB and save a source-safe scorecard summary.
- [x] 7.4 Dogfood against at least one Next.js-heavy repo and one Python/backend-heavy repo.
- [x] 7.5 Use scorecard failures to update ranking, report UX, or docs before public alpha.

## 8. Release Gate

- [x] 8.1 Run `npm run typecheck`, `npm test`, `npm run build`, and `openspec validate --all --no-interactive`.
- [x] 8.2 Run package smoke test from the packed tarball.
- [x] 8.3 Add changelog entry for public alpha.
- [x] 8.4 Confirm license and package name.
- [x] 8.5 Produce a public-alpha release checklist result marked pass/fail.
