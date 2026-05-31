## Context

The landing page currently says "Public alpha" in the hero and footer. Deepclean is now released, so the public site should not undercut the current release state with stale launch wording.

## Goals / Non-Goals

**Goals:**

- Remove alpha labels without adding a replacement release-channel badge.
- Keep the update focused on website copy.
- Use the current default `deepclean scan` command in the install snippet.

**Non-Goals:**

- Rework the landing page design or Cleeby branding.
- Rename docs that still describe beta onboarding/history.
- Change package metadata, release workflows, or CLI behavior.

## Decisions

- Remove the hero eyebrow entirely so the first viewport stays focused on Cleeby, the product name, and the value proposition.
- Use a neutral "MIT licensed." footer so the footer does not need release-channel maintenance.
- Prefer `deepclean scan` over the older explicit synthesis flag because synthesis is now the default documented path.

## Risks / Trade-offs

- [Risk] Some deeper docs still mention beta-era onboarding. -> Mitigation: keep this change scoped to the public landing page; deeper docs can be cleaned up in a separate pass.
