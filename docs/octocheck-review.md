# Octocheck Review

Deepclean uses Octocheck as the pull request review trigger and Crabbox as the execution path for Codex reviews.

The repo exposes a named Crabbox job:

```bash
crabbox job run review
```

That job runs:

```bash
node scripts/octocheck-review.mjs
```

The script resolves the pull request base, runs `codex review --base <base>`, writes the raw review to `.octocheck/codex-review.md`, and posts or updates a sticky GitHub PR comment when `gh` is authenticated and a PR number is available.

Useful local checks:

```bash
npm run review:codex -- --dry-run
crabbox job run -dry-run review
```

By default fork pull requests are skipped when GitHub event metadata identifies them as forks. Set `OCTOCHECK_ALLOW_FORKS=true` only for trusted runs.
