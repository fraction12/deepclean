## Context

The current site was built around a dark "Cleanroom Console" visual system with animated constellation graphics. Cleeby changes the brand tone: Deepclean should now feel like a small, friendly CLI helper rather than an AI product showcase.

## Goals / Non-Goals

**Goals:**

- Make the first screen immediately answer: what is Deepclean, how do I install it, where are the links?
- Use Cleeby as the main visual signal.
- Keep the page static, fast, and easy to maintain.
- Preserve accessibility and responsive behavior.

**Non-Goals:**

- Add new generated artwork.
- Add runtime dependencies or a client-side framework.
- Rewrite README/docs content or CLI behavior.

## Decisions

- Use a light, friendly utility style with navy text, icy surface colors, aqua, amber, and green accents. This moves away from the futuristic dark palette while staying visually connected to Cleeby.
- Keep one compact hero and two simple sections: install and workflow. "Some links" live as direct hero/footer actions.
- Remove the constellation script from the page runtime. The website no longer needs animated background state.
- Use plain HTML/CSS workflow items instead of reusing Remotion or diagram assets. The repo does not include a separate static HTML diagram asset in the site tree, and the user's desired direction is simpler than the current diagram-heavy treatment.

## Risks / Trade-offs

- [Risk] The page may feel less "premium" than the old animated version. -> Mitigation: rely on clear copy, clean spacing, and Cleeby's personality rather than visual noise.
- [Risk] Existing `site/constellation.js` becomes unused. -> Mitigation: remove it from the built site inputs in this change so there is no dead runtime asset.
