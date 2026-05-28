## Why

The landing page hero constellation currently changes active clusters abruptly, which can read as a flashing background animation. The site should feel calm and premium while preserving the existing visual direction.

## What Changes

- Smooth the hero background constellation by fading active cluster intensity in and out instead of switching instantly.
- Keep reduced-motion behavior intact.
- Preserve the existing static site structure, content, palette, and deployment flow.

## Capabilities

### Modified Capabilities

- `public-landing-site`: Smooth hero background animation behavior.

## Impact

- Updates the static landing page animation script under `site/`.
- May adjust related CSS only if needed for visual polish.
- No CLI behavior, package release behavior, provider behavior, or GitHub Pages workflow behavior changes.
