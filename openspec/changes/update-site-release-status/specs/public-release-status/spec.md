## ADDED Requirements

### Requirement: Current landing-site status
The public landing site SHALL avoid describing Deepclean as an alpha product.

#### Scenario: Visitor opens the landing page
- **WHEN** a visitor opens the landing page
- **THEN** the hero does not show public-alpha or release-channel status label text

#### Scenario: Visitor reads the footer
- **WHEN** a visitor reads the landing page footer
- **THEN** the footer does not describe the project as public alpha

### Requirement: Current install example
The public landing site SHALL show the current default scan command in its install snippet.

#### Scenario: Visitor follows install snippet
- **WHEN** a visitor follows the install commands
- **THEN** the snippet uses `deepclean scan` as the normal scan path
