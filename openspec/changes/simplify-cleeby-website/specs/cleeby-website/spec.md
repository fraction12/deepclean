## ADDED Requirements

### Requirement: Mascot-led simple homepage
The public website SHALL present Deepclean with a cute, low-noise visual style led by Cleeby.

#### Scenario: Visitor opens the homepage
- **WHEN** a visitor opens the homepage
- **THEN** the first viewport shows Cleeby, the Deepclean name, a concise description of what the tool does, install guidance, and primary links

### Requirement: Essential content only
The public website SHALL focus on the tool name, what it does, installation, links, and workflow.

#### Scenario: Visitor scans the page
- **WHEN** a visitor scans the homepage
- **THEN** they can quickly find the install command, GitHub link, npm package link, documentation link, and the core workflow steps

### Requirement: Low-noise static presentation
The public website SHALL avoid the previous futuristic animated-background treatment.

#### Scenario: Page renders
- **WHEN** the homepage renders
- **THEN** it does not load or show the constellation canvas animation, glowing futuristic backdrop, or busy AI-styled decorative effects

#### Scenario: Page renders on a narrow viewport
- **WHEN** the homepage renders on a mobile-width viewport
- **THEN** text, buttons, logo, install commands, and workflow items remain readable without horizontal scrolling or overlap
