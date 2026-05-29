# Beta Dogfood Matrix

Beta dogfood proves Deepclean can run the full operating loop on real and noisy repositories without source leakage.

## Required Repositories

- `deepclean`: this repository, using the current release candidate.
- `lightningitb`: larger mixed application, reported only as source-safe counts and diagnostics.
- `additional-1`: a second application or tooling repository with a different stack shape.
- `additional-2`: a third repository with different ownership, language, or workflow shape.
- `generated-noisy`: a synthetic or disposable repository containing generated files, vendored files, ignored directories, build output, stale state, and partial-state fixtures.

## Required Commands

Run each repository with an isolated state directory when the repository is private:

```bash
deepclean --root <repo> --state-dir <scratch-state> doctor --json
deepclean --root <repo> --state-dir <scratch-state> status --json
deepclean --root <repo> --state-dir <scratch-state> scan --evidence-only --json
deepclean --root <repo> --state-dir <scratch-state> report --json
deepclean --root <repo> --state-dir <scratch-state> next --json
deepclean --root <repo> --state-dir <scratch-state> show <candidate-id> --json
deepclean --root <repo> --state-dir <scratch-state> plan <candidate-id> --json
deepclean --root <repo> --state-dir <scratch-state> handoff <candidate-id> --json
deepclean --root <repo> --state-dir <scratch-state> revalidate all --json
deepclean --root <repo> --state-dir <scratch-state> prune --keep-runs 1 --dry-run --json
deepclean --root <repo> --state-dir <scratch-state> status --json
```

Use `scan --synthesize --privacy-mode metadata --excerpt-budget 0` only when provider use is safe for that repository. Private repos default to `--evidence-only`.

## Source-Safe Reporting Rules

- Commit only counts, timings, command pass/fail, diagnostic codes, quality scores, and residual-risk notes.
- Do not commit source excerpts, prompts, provider payloads, private absolute paths, private branch names, private issue names, or private report prose.
- Use `deepclean export --source-safe` for any generated state that must leave the machine.
- Redact repository names when the repository itself is private and not already named in the beta matrix.
- Keep raw `.deepclean` dogfood output untracked unless it is a synthetic fixture.
