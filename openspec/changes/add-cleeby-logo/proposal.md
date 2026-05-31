## Why

Deepclean now has a mascot/logo concept, Cleeby, that gives the project a warmer and more recognizable identity. The README and public site should use the same checked-in asset so the brand presentation is consistent across GitHub, GitHub Pages, and social previews.

## What Changes

- Add Cleeby as the project mascot/logo asset under the static site assets.
- Show Cleeby at the top of the README with accessible alt text and a short mascot caption.
- Replace the abstract header mark on the public site with the Cleeby logo.
- Add favicon and Open Graph/Twitter image metadata that point at the Cleeby asset.

## Capabilities

### New Capabilities

- `public-branding`: Public README and landing-site branding presentation for the Deepclean logo/mascot.

### Modified Capabilities

- None.

## Impact

- Adds one static PNG asset under `site/assets/`.
- Updates `README.md`, `site/index.html`, and `site/styles.css`.
- Does not change CLI behavior, package runtime behavior, npm publishing, provider execution, or generated `.deepclean/` artifacts.
