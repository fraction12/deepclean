## ADDED Requirements

### Requirement: Smooth hero constellation animation
The landing page hero background SHALL transition between constellation clusters with gradual fade-in and fade-out motion rather than abrupt flashing changes.

#### Scenario: Active cluster changes
- **WHEN** the hero constellation advances from one workflow stage to the next
- **THEN** particle intensity, halos, connection lines, and sweep effects fade between the outgoing and incoming clusters smoothly

#### Scenario: Reduced motion is enabled
- **WHEN** the visitor has reduced-motion enabled
- **THEN** the animated constellation remains disabled according to the existing reduced-motion behavior
