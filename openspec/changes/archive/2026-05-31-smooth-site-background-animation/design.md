## Context

The hero background animation is rendered by `site/constellation.js`. The current implementation computes one active cluster from elapsed time and immediately applies elevated opacity, halos, connections, and scan sweep to that cluster. When the active cluster changes, those visual layers switch at the same frame.

## Approach

- Replace the hard active-cluster value with per-cluster activity weights.
- Use a smoothstep easing curve during the final part of each stage interval so the outgoing cluster fades down while the incoming cluster fades up.
- Draw connections and scan sweeps with weight-aware opacity so they do not pop on or off.
- Continue using the dominant cluster for stage labels and border emphasis.

## Constraints

- Keep the animation framework-free and static-site compatible.
- Keep reduced-motion users on the existing non-animated path.
- Avoid increasing asset size or adding new dependencies.
