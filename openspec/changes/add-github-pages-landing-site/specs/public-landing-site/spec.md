## ADDED Requirements

### Requirement: Static public landing page
The repository SHALL include a static public landing page that presents Deepclean's product promise, install path, local-first privacy posture, and GitHub project link without requiring a client-side application framework at runtime.

#### Scenario: Visitor opens the landing page
- **WHEN** a visitor opens the published site
- **THEN** the first viewport presents Deepclean's name, a concise maintainability promise, install guidance, GitHub link, and a minimal terminal-led hero visual

#### Scenario: Visitor scans the page
- **WHEN** a visitor scrolls below the first viewport
- **THEN** the page presents concise sections for the workflow, generated artifacts, local-first trust posture, and public-alpha scope

### Requirement: Cleanroom Console visual system
The landing page SHALL use the approved Cleanroom Console visual system with deep ink, clean surface, electric aqua, caution amber, and OpenClaw-inspired typography.

#### Scenario: Page is rendered
- **WHEN** the landing page is rendered
- **THEN** the page uses Clash Display-style display typography, Satoshi-style body typography, and excludes pink, lime, purple gradients, beige/tan themes, mascots, and noisy decorative visuals

#### Scenario: Page is viewed on narrow screens
- **WHEN** the landing page is viewed on a mobile-width viewport
- **THEN** text, buttons, terminal content, and sections remain readable without overlapping or horizontal scrolling

### Requirement: Remotion hero source and asset
The repository SHALL include Remotion source for the minimal terminal hero animation and a generated static media asset suitable for GitHub Pages.

#### Scenario: Hero media is unavailable
- **WHEN** the visitor's browser cannot play the hero media or motion is reduced
- **THEN** the landing page provides a static terminal fallback that communicates the same product workflow

#### Scenario: Maintainer updates the hero animation
- **WHEN** a maintainer changes the Remotion source and runs the render script
- **THEN** the generated hero media under the site asset directory is refreshed from source

### Requirement: GitHub Pages deployment
The repository SHALL include a GitHub Actions workflow that publishes the static landing site to GitHub Pages without changing npm package release behavior.

#### Scenario: Pages workflow runs
- **WHEN** the Pages workflow runs on the default branch or via manual dispatch
- **THEN** it builds or stages the static site artifact and deploys it using GitHub Pages Actions

#### Scenario: Package release checks run
- **WHEN** existing npm release checks run
- **THEN** landing site files and Remotion development assets do not become required npm package contents
