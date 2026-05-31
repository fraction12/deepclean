## Approach

The background label pills are static HTML elements styled by `.constellation-label` rules and nudged by `site/constellation.js`. Removing them should be a structural cleanup rather than hiding them with CSS.

- Delete the three background label elements from the hero background.
- Delete the `.constellation-label` CSS family and responsive overrides.
- Delete the label query/update logic from the constellation script.

## Constraints

- Preserve the constellation canvas animation and stage pills in `.hero-stages`.
- Keep reduced-motion behavior unchanged.
- Avoid new assets or dependencies.
