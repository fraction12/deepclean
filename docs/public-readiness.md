# Public Readiness Notes

Deepclean is now shaped like a public CLI rather than a local experiment:

- `.deepclean/`, local agent folders, logs, tarballs, dependencies, and build output are ignored.
- CI runs typecheck, tests, build, package smoke, and optional OpenSpec validation.
- `npm run release:check` validates the packed tarball and rejects private artifacts.
- Reports are source-safe by default and source excerpts are not sent to Codex unless explicitly enabled.
- External analyzer evidence can be ingested through SARIF and optional `jscpd`.
- Codex synthesis now uses a built-in reviewer pack informed by a vendored MIT-licensed Matt Pocock skills snapshot, while keeping runtime prompts reproducible and source-safe.
- Reports separate the agent queue from raw candidate evidence, return explicit artifact paths in JSON, and infer verification commands from the target repository's Makefile and package scripts.

## Still Deliberately Deferred

- Naming and brand decisions.
- Fix/recheck/open-pr loop.
- npm publish.

Those are product/release decisions, not accidental implementation gaps.
