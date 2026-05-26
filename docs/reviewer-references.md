# Reviewer References

Deepclean keeps its synthesis reviewer pack built in, but it now uses a vendored Matt Pocock skills snapshot as a reference source for reviewer design.

## Matt Pocock Skills Snapshot

- Source: <https://github.com/mattpocock/skills>
- Snapshot: `third_party/matt-pocock-skills/`
- License: MIT, Copyright (c) 2026 Matt Pocock
- Snapshot commit: recorded in `third_party/matt-pocock-skills/SNAPSHOT.md`

The snapshot is not loaded dynamically during public-alpha scans. Runtime synthesis uses distilled reviewer rubrics in `src/reviewers.ts` so outputs are reproducible and package installs do not depend on private agent workspaces or live network access.

## Distilled Reviewer Additions

The default reviewer pack now includes Matt Pocock-inspired rubrics for:

- deep module discipline
- feedback loop discipline
- agent-ready cleanup slices

These complement the existing Deepclean reviewers for architecture, duplication, dependency graph shape, testability, domain language, AI-slop patterns, and critic pass.

## Update Policy

When refreshing the snapshot:

1. Run `npm run sync:matt-skills`.
2. Review upstream license and repository shape before copying any new guidance into reviewer rubrics.
3. Keep the upstream MIT license and copyright notice.
4. Confirm `third_party/matt-pocock-skills/SNAPSHOT.md` records the new commit.
5. Distill useful engineering principles into built-in rubrics instead of dumping the full upstream skill text into every prompt.
6. Run `npm run release:check` and `npm run spec:validate`.
