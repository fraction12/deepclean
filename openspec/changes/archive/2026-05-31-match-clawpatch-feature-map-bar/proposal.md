# Match ClawPatch Feature Map Bar

## Why

Deepclean already persists basic semantic feature records, but they are still adjacent metadata. To match ClawPatch's operating bar, the feature map has to become the stable review surface that every later cleanup candidate, report, and handoff can refer to.

ClawPatch is not model-first: it maps the repository structure first, then uses model review inside that bounded semantic surface. Deepclean should adopt the same posture for maintainability planning before trying to surpass it with workflow-aware cleanup planning.

## What Changes

- Make `deepclean map` a source-selectable feature mapping command with deterministic mapping as the default path.
- Promote feature records from loose work-unit summaries into ownership maps with entrypoints, owned files, context/shared files, tests, verification commands, confidence, and mapping source.
- Attach feature IDs and file roles to evidence and candidates where local mapping can determine ownership.
- Group report, `next`, `show`, `plan`, and `handoff` output around mapped features when feature evidence exists.
- Add feature-scoped filtering so agents can inspect or plan within one mapped feature surface.
- Keep provider/model enrichment optional and constrained to refining deterministic maps, not inventing map structure from scratch.

## Non-Goals

- Do not add source mutation, fix execution, branch creation, or PR automation.
- Do not attempt to beat ClawPatch with workflow/product-domain inference in this slice.
- Do not require a provider for the default feature map.
- Do not port every ClawPatch language mapper at once.
- Do not expose private source to remote services without explicit provider configuration.

## Success Bar

After this change, Deepclean should be able to say:

"This candidate belongs to the Job Lifecycle feature. These files are entrypoints, these files own the behavior, these files are shared context, these tests pin the behavior, and this plan should stay inside that feature boundary."

That is the ClawPatch parity bar. Better-than-ClawPatch workflow intelligence can come after this is stable.
