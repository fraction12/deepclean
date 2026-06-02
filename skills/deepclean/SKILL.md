---
name: deepclean
description: "Use DeepClean to scan repos, run quality gates, choose cleanup opportunities, create plans/handoffs, review PRs, and apply guarded cleanup fixes."
---

# DeepClean

Use this skill when the user asks to run DeepClean, clean up a repo, dogfood DeepClean, produce architecture cleanup reports, pick the next cleanup PR, run a release-quality gate, review a PR with DeepClean context, or hand cleanup work to another agent.

DeepClean is a local cleanup control plane. It turns repo evidence into ranked PR opportunities, source-safe reports, plans, and handoffs. It is not a hosted PR reviewer, a scanner replacement, or a magic refactor bot.

## Setup

From the target repo:

```bash
deepclean --version
deepclean doctor
```

If missing:

```bash
npm install -g @fraction12/deepclean
```

If the repo is not initialized:

```bash
deepclean init --json
```

Add `.deepclean/` to `.gitignore` unless generated cleanup state is deliberately shared.

## Default Loop

Always start read-only:

```bash
git status --short
deepclean status --json
```

Obey `data.nextAction.command` when present.

If state is missing, stale, or too thin:

```bash
deepclean scan --json
deepclean campaign --json
deepclean report --json
deepclean next --json
```

For private/offline work:

```bash
deepclean scan --evidence-only --json
```

## Pick Work

Use opportunities first:

```bash
deepclean campaign --json
deepclean show <opportunity-id> --json
deepclean plan <opportunity-id> --json
deepclean handoff <opportunity-id> --format codex --json
```

Decision rules:

- Pick the first `recommended` or `safe-narrow-pr` opportunity unless the user named a target.
- Treat `stop-campaign` as a hard stop. Do not force a cleanup PR past it.
- Prefer small PR-shaped work over broad architecture surgery.
- If the target is `design-needed`, write a design/spec first. Do not improvise architecture.
- Ignore metric-only noise unless DeepClean connects it to a concrete opportunity or plan.
- Fall back to `candidate-*`, `theme-*`, or `finding-*` only when no usable opportunity exists.

## Quality Gate

Use before release calls, serious PR handoff, or "is this good enough?":

```bash
deepclean ci --profile balanced --timeout 90 --json
```

Read the gate, not just the exit code:

- blockers mean do not release or merge without fixing or explicitly accepting the risk.
- `advisory` means no blocker, but the advisories still matter.
- analyzer setup recommendations are product work, not proof the repo is broken.

Do not reimplement scanners. DeepClean should orchestrate Semgrep/SARIF/jscpd evidence when available.

## PR Review

Source-safe PR context:

```bash
deepclean review-pr --base origin/main --head HEAD --json --state-dir .octocheck/deepclean
```

PR against a known cleanup target:

```bash
deepclean review-pr --base origin/main --head HEAD --target <opportunity-id> --json
```

Judge whether the PR touches the right files, reduces the target risk, and has the right verification. Let OctoCheck/GitHub publish comments; DeepClean supplies local context.

## Guarded Fixes

Do not mutate source unless the user explicitly asked for a fix.

Preflight:

```bash
git status --short
deepclean show <target-id> --json
deepclean plan <target-id> --json
```

Apply one bounded target with explicit proof:

```bash
deepclean fix <target-id> --mode guarded --apply --verification "npm test" --json
deepclean revalidate <target-id> --json
git diff
```

Repeat `--verification` when one proof command is not enough.

Never use guarded fixes for broad rewrites, dependency upgrades, release publishing, speculative design, ambiguous ownership changes, or dirty worktrees you have not inspected.

## Handoffs

When handing work to another agent, include:

- target ID and title
- `show --json` summary
- plan path or key `plan --json` fields
- exact files in scope
- stop lines
- verification commands
- whether mutation is allowed

For implementation handoffs, require verification and `deepclean revalidate <target-id>` before "done."

## Maintenance

Dry-run pruning first:

```bash
deepclean prune --keep-runs 5 --dry-run --json
```

Apply only when unsurprising:

```bash
deepclean prune --keep-runs 5 --json
```

For recurring weirdness:

```bash
deepclean schemas --json
deepclean status --json
```

Then inspect `.deepclean/`. Do not hand-delete `config.json`, locks, or active run artifacts.

## Report Back

Report facts:

- version used
- commands passed/failed
- candidate/opportunity counts
- selected target
- report/plan/handoff paths
- quality gate status
- verification evidence
- whether the repo stayed clean

No vibes. No "looks good" without proof.
