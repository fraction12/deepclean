## Design

Fix execution is a controlled local mutation workflow. Deepclean prepares a bounded packet; a local worker may edit source; Deepclean then inspects the result before recording success.

### Required Gates

Before patching:

- target resolves to one stable finding or bounded slice;
- current plan exists and names owned files;
- finding is not broad, stale, suppressed, fixed, superseded, low-confidence, or ambiguous;
- working tree is clean unless explicitly allowed;
- verification command is supplied or approved by the plan.

After patching:

- changed files are inside owned scope or explicitly allowed;
- verification ran and result is captured;
- no commits, pushes, PRs, publishes, or external actions occurred;
- fix attempt is persisted as passed, failed, scope-failed, refused, or unverified.

### Branch Isolation

The default applied workflow should either require a clean working tree or create/use an explicit branch name. Deepclean can remain local-only, but it must record branch and dirty-state provenance.

### Scope Enforcement

The worker prompt is not enough. Deepclean must inspect `git diff --name-only` or equivalent after patching and compare changed files to allowed files.

### Verification

Verification output should be bounded but durable. Large command output should be summarized and stored with exit code, command, duration, and artifact path where applicable.
