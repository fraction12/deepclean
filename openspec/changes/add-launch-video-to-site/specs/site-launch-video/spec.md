## ADDED Requirements

### Requirement: Launch video section
The public website SHALL include a focused launch video section that visitors can play.

#### Scenario: Visitor opens the site
- **WHEN** a visitor opens the public website
- **THEN** the page includes a launch video section between the hero and install sections
- **AND** the section uses the launch poster before playback

### Requirement: User-controlled playback
The public website SHALL avoid surprising visitors with autoplaying audio.

#### Scenario: Visitor reaches the launch video
- **WHEN** the launch video is visible
- **THEN** the video provides native playback controls
- **AND** the video does not autoplay with audio

### Requirement: Static asset publishing
The site build SHALL publish all assets required by the launch video section.

#### Scenario: Site is built
- **WHEN** the static site build runs
- **THEN** the output includes the launch MP4 and poster image
- **AND** the local preview server serves MP4 and JPEG assets with appropriate content types
