# Design

## Feature Records

Feature records are run-linked generated state, similar to evidence and candidates. Each record has a stable `featureId`, title, summary, kind, confidence, owned files, context files, test files, verification commands, and tags.

The first implementation deliberately maps the languages Deepclean already supports:

- npm/package scripts from `package.json`
- TypeScript/JavaScript modules, React components, and route files
- Python modules and route-bearing modules
- test suites
- common project config files

## Scan Integration

`deepclean scan` maps features from the same scoped source files used by the evidence adapters, then writes `.deepclean/features/<runId>.json`. Incremental scans therefore create a feature map for the scanned slice, while full scans create a whole-repo map.

## Command Integration

`deepclean map` performs discovery plus feature mapping, writes `.deepclean/features/<mapId>.json`, and prints/returns the mapped feature count. It is intentionally report-only and does not generate candidates.

## Future Work

Later slices can use feature IDs in candidates, clusters, synthesis prompts, and plans. Provider-assisted feature enrichment should come after the local map is stable.
