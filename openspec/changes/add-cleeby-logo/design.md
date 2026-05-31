## Context

Deepclean's README and GitHub Pages site currently present the product with text-first branding and an abstract CSS header mark. Cleeby is now the chosen mascot/logo, and the logo should be owned by the repository rather than referenced from Codex-generated image storage.

## Goals / Non-Goals

**Goals:**

- Store a stable Cleeby PNG asset under `site/assets/` so GitHub Pages can serve it.
- Use Cleeby in the README and public site header without changing product copy or CLI behavior.
- Add social preview metadata that points at the public GitHub Pages asset URL.

**Non-Goals:**

- Rework the landing page layout or marketing narrative.
- Add vector conversion, responsive image generation, or npm package asset packaging.
- Change release automation, CLI commands, or generated Deepclean artifacts.

## Decisions

- Keep the generated image as a PNG site asset. The current logo is raster-generated, and PNG keeps the change small without inventing a lossy vector approximation.
- Resize the checked-in asset to a web-appropriate square instead of committing the larger generated source. The Codex-generated original remains in Codex storage; the repo receives the optimized public asset.
- Reference the site-local asset from `site/index.html` and use the public GitHub Pages URL for social metadata. This keeps local site preview simple while making link previews stable after deployment.

## Risks / Trade-offs

- [Risk] PNG is less flexible than SVG for tiny icon sizes. -> Mitigation: keep the asset square, simple, and centralized so a future vector pass can replace one filename.
- [Risk] README image rendering outside GitHub may depend on relative asset support. -> Mitigation: use the repository-relative asset path so GitHub renders immediately; the site metadata uses the deployed absolute URL.
