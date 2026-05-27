## Context

Deepclean is a public-alpha CLI with a clear local-first trust story, but its public presence is currently README-driven. The landing page needs to feel like current open-source AI/devtool sites while avoiding their common clutter: mascot-first branding, repeated feature grids, social-proof walls, and visually noisy hero scenes.

The page will be hosted with GitHub Pages for the `fraction12/deepclean` repository. OpenClaw's live site uses Fontshare-hosted Clash Display and Satoshi; Deepclean will use the same typography direction while keeping its own color system and product metaphor.

## Goals / Non-Goals

**Goals:**

- Build a minimal, polished static landing page for GitHub Pages.
- Make one eye-catcher do the work: a large Remotion-authored terminal animation.
- Use the approved Cleanroom Console palette: ink, clean surface, aqua, amber, and muted line/text colors.
- Keep runtime static and dependency-light for visitors.
- Add a maintainable render path for updating the hero media.

**Non-Goals:**

- No CLI behavior changes.
- No hosted app, analytics, newsletter backend, or runtime API calls.
- No mascot, testimonial wall, broad comparison table, or overstuffed feature grid.
- No publishing of private source or generated `.deepclean/` artifacts.

## Decisions

### Static site with committed assets

The landing page will live under `site/` and be deployable by staging static files. This keeps GitHub Pages deployment simple and avoids introducing a frontend application framework for one page.

Alternatives considered:

- **Vite/Astro app:** easier component model, but unnecessary runtime/build complexity for a single page.
- **`docs/` Pages source:** GitHub-supported, but this repository already uses `docs/` for project documentation.

### Remotion as source/render tool, not runtime dependency

The terminal eye-catcher will be authored in Remotion and rendered to a static media asset under `site/assets/`. The page will use `<video>` with a static HTML/CSS fallback. This gives a distinctive animated hero while keeping the public page fast and robust.

Alternatives considered:

- **`@remotion/player` in the browser:** more interactive, but heavier and unnecessary for a looping hero.
- **Pure CSS animation only:** simpler, but it does not satisfy the desired Remotion-authored visual asset.

### Typography mirrors OpenClaw without copying its visual identity

The site will load Clash Display and Satoshi from Fontshare, matching OpenClaw's typography stack. Deepclean will avoid OpenClaw's mascot, coral/space theme, social wall, and dense integration sections.

### Minimal content model

The page will use a concise structure:

1. Hero with install command, GitHub link, and terminal animation.
2. Four-step workflow.
3. Artifact preview.
4. Local-first trust.
5. Public-alpha scope and final CTA.

This avoids repeating the same "local, report-first, no edits" message in multiple sections.

## Risks / Trade-offs

- **Remotion render adds dev dependencies** -> Keep Remotion dependencies in `devDependencies` and keep them out of npm package `files`.
- **Fontshare availability affects typography** -> CSS will include local fallback stacks so the page remains readable if fonts fail.
- **Video autoplay may be blocked or disabled** -> Use muted, looped, playsinline media and provide a static fallback.
- **GitHub Pages must be enabled for Actions source** -> Document the workflow and use the official Pages actions path.

## Migration Plan

1. Add OpenSpec requirements and tasks.
2. Add the static site and Remotion source.
3. Render hero media locally when possible.
4. Add GitHub Pages workflow.
5. Validate OpenSpec, TypeScript/package checks, and responsive rendering.

Rollback is deleting the `site/` directory, Remotion scripts/dependencies, and Pages workflow; no CLI data or package runtime behavior is affected.

## Open Questions

- Whether GitHub Pages is already configured to use GitHub Actions as its source in repository settings. The workflow can be committed now; repository settings may need to be switched once on GitHub.
