# Design

## Parity Principle

Deepclean should match ClawPatch's map-first posture:

1. Build a deterministic local repository map.
2. Classify feature ownership and file roles.
3. Attach evidence and candidates to that map.
4. Use model synthesis only as bounded judgment over the map.
5. Render reports and handoffs through feature scopes.

The default path must work without a provider. Provider-assisted map enrichment is allowed only after the deterministic map exists.

## Map Sources

`deepclean map` should support explicit source selection:

- `heuristic`: deterministic local mapping only.
- `auto`: deterministic local mapping, then optional configured enrichment when safe and available.
- `agent`: provider-assisted enrichment over a deterministic seed map.

`auto` may be the ergonomic default later, but the implementation must keep deterministic output available and testable.

## Feature Record Shape

Feature records should retain current fields and add the structure needed for ClawPatch-style review:

- `mapSource`: `heuristic`, `auto`, or `agent`.
- `entrypoints`: files or commands that start the workflow.
- `ownedFiles`: files that primarily implement the feature.
- `contextFiles`: shared dependencies, helpers, adapters, and config used by the feature.
- `testFiles`: tests that pin the feature or its contracts.
- `verification`: exact commands inferred for the feature.
- `fileRoles`: per-path role metadata: `entrypoint`, `owned`, `context`, `shared`, `test`, `config`, or `generated`.
- `confidence`: confidence in the assignment.
- `reasons`: short local reasons for the feature boundary.

Generated, vendored, dependency, and build-output paths should not become feature-owned files by default.

## Deterministic Detectors

The first parity implementation should focus on locally discoverable feature surfaces:

- package scripts and CLI commands
- TS/JS module import graphs, including source-resolved ESM specifiers
- React route/page/component entrypoints
- Python modules and route-bearing files
- backend service/job/worker naming conventions
- test-to-source pairing
- common config and infrastructure files

This does not need perfect product semantics yet. It needs reliable enough boundaries to constrain cleanup work.

## Evidence And Candidate Attachment

Evidence records should include affected feature IDs and per-file roles when the map can determine them. Candidate generation should prefer feature-scoped explanations over raw file-metric explanations.

Example:

- Weak: `backend/db.py is large`.
- Strong: `Job Lifecycle depends on mixed DB/job-manager ownership; status reads and writes cross the router/worker/service boundary.`

## Reporting And Planning

When feature maps exist:

- report start-here guidance should name the affected feature
- `next` should expose the affected feature ID
- `show` should include feature context
- `plan` should distinguish entrypoints, owned files, context files, tests, and non-goals
- `handoff` should instruct agents to stay inside the feature boundary unless explicitly marked cross-cutting

## Provider Guardrail

Model enrichment may rename, merge, split, or summarize feature records only when it cites deterministic map inputs. It must not create feature ownership claims that cannot be traced to local paths, imports, tests, commands, or configured project context.

## Later Work

After parity, Deepclean can go beyond ClawPatch by adding repo operating profiles and workflow-level priority lanes such as job lifecycle, estimator chat, admin auth, and frontend workspace.
