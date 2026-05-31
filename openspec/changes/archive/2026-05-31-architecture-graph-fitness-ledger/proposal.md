# Architecture Graph Fitness Ledger

## Why

Deepclean already collects import graph evidence, feature context, clustering links, dependency slices, and revalidation proof, but each surface interprets architecture pressure separately. That makes dependency-hotspot fixes look like failed work unless the original finding disappears completely.

This change introduces a shared architecture graph and fitness progress layer so Deepclean can prove campaign movement across size and dependency pressure.

## What Changes

- Extract local import graph collection into a reusable architecture graph module.
- Make evidence, feature mapping, and clustering consume the same graph semantics.
- Add a fitness progress helper that compares before/after evidence for line, fan-in, and fan-out reductions.
- Make revalidation use the fitness helper instead of line-only metric logic.
- Preserve existing report, status, and PR workflow behavior while allowing dependency-hotspot campaign progress to count as proof.

## Non-Goals

- No repository-specific `.deepclean/architecture.json` policy file yet.
- No layer-boundary enforcement or forbidden-edge rules yet.
- No broad status/report redesign.
- No autonomous multi-candidate rewrite behavior.

## Success Bar

When a dependency-hotspot fix reduces incoming or outgoing local dependency pressure, revalidation records a durable partially-resolved progress record with before/after/delta evidence, and the same architecture graph feeds evidence, feature context, and cluster relationships.

## Capabilities

### Modified Capabilities

- `evidence-engine-ingestion`: shared architecture graph source.
- `maintainability-candidates`: dependency-hotspot fitness progress.
- `project-state`: revalidation progress proof ledger.
- `reporting-and-handoff`: existing proof surfaces consume richer progress records.

## Impact

- New shared graph and fitness modules.
- Evidence adapter refactor.
- Feature mapper import context refactor.
- Cluster graph-link refactor.
- Revalidation progress classification extension.
