# Beta Release Checklist

Beta release is blocked unless every required gate below is green or explicitly recorded as an allowed beta residual risk.

## Required Gates

- Typecheck passes: `npm run typecheck`
- Tests pass: `npm test`
- OpenSpec validates: `openspec validate beta-docs-onboarding`
- Repository specs validate: `npm run spec:validate`
- Release check passes: `npm run release:check`
- Beta onboarding docs cover install, update, first scan, status/report interpretation, guarded fix workflow, revalidation proof, source-safe support artifacts, privacy, troubleshooting, and limitations.
- Beta dogfood matrix has passing source-safe scorecards for:
  - `deepclean`
  - `lightningitb`
  - `additional-1`
  - `additional-2`
  - `generated-noisy`

## Beta Dogfood Gate

`npm run release:check` enforces dogfood scorecards when the package version contains `-beta`, `DEEPCLEAN_RELEASE_CHANNEL=beta`, or `DEEPCLEAN_REQUIRE_BETA_DOGFOOD=1`.

Each required matrix slot must have a scorecard section with:

- `Matrix Slot: <slot>`
- `Gate: pass`
- source-safe command results covering doctor, status, scan, report, next/show, plan/handoff, revalidate, prune dry-run, and final status

## Allowed Residual Risks

These risks may ship in beta when they are recorded in the scorecard and have a follow-up owner:

- Provider synthesis timeout or unavailable-provider diagnostics, if local evidence, candidates, and reports are preserved.
- Medium false-positive risk from local metric candidates, if ranking and report notes make the risk visible.
- Private-repo dogfood run with evidence-only mode, if provider use would leak source or private context.
- Generated/noisy fixture limitations, if at least one noisy synthetic fixture is checked or rerun locally.

These risks block beta:

- Missing required matrix slot.
- Any required matrix slot with `Gate: fail` or `Gate: blocked`.
- Source excerpts, prompts, provider payloads, or private absolute paths in committed dogfood artifacts.
- Partial state, duplicate IDs, stale artifacts, malformed provider output, or timeout recovery causing commands to crash or corrupt state silently.
