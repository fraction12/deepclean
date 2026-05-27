## Why

Deepclean has public-alpha CLI documentation, but no focused public landing page that communicates the product promise, local-first trust model, and install path quickly. A minimal GitHub Pages site can give the project a polished first impression without changing CLI behavior or introducing hosted product infrastructure.

## What Changes

- Add a static landing site for Deepclean with a minimal hero, concise product sections, and direct install/GitHub CTAs.
- Use the selected Cleanroom Console palette: deep ink, clean surface, electric aqua, and caution amber only.
- Use OpenClaw-inspired typography with Clash Display for display text and Satoshi for body text.
- Add Remotion source for the hero terminal animation and a rendered/static fallback asset path for GitHub Pages.
- Add a GitHub Pages workflow that publishes the static site from repository-controlled build output.
- Add package scripts and documentation for previewing, rendering, and building the landing site.

## Capabilities

### New Capabilities

- `public-landing-site`: Public GitHub Pages landing site, visual direction, generated hero asset handling, and deploy workflow.

### Modified Capabilities

- None.

## Impact

- Adds static site files under `site/`.
- Adds Remotion source files and scripts for generating hero media.
- Adds GitHub Pages workflow under `.github/workflows/`.
- Adds package scripts and development dependencies for Remotion rendering.
- No CLI commands, state formats, privacy defaults, package publish behavior, or runtime provider behavior are changed.
