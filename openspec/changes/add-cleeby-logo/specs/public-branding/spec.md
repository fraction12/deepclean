## ADDED Requirements

### Requirement: Cleeby logo asset
The repository SHALL include a checked-in Cleeby logo asset for public project branding.

#### Scenario: Maintainer views the logo asset
- **WHEN** a maintainer inspects the static site assets
- **THEN** the Cleeby logo image is available under the site asset directory with a stable filename

### Requirement: README brand presentation
The README SHALL display Cleeby as the Deepclean mascot/logo near the project introduction with accessible alternative text.

#### Scenario: Reader opens README
- **WHEN** a reader opens the repository README
- **THEN** the introduction includes the Cleeby logo image, the `deepclean` heading, and a short mascot caption before installation guidance

### Requirement: Public site brand presentation
The public landing site SHALL use Cleeby as the visible project logo and social preview image.

#### Scenario: Visitor opens the public site
- **WHEN** a visitor opens the landing page
- **THEN** the header brand mark uses the Cleeby logo with accessible labeling for the Deepclean home link

#### Scenario: Link preview reads site metadata
- **WHEN** a crawler reads the landing page metadata
- **THEN** the page exposes favicon, Open Graph image, and Twitter image metadata that point at the Cleeby logo asset
