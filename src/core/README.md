# Core

Framework-independent Morphodyne domain rules belong here. `model.ts` defines structural data, factual events, and Blueprint validation. Phase 1 adds primitive and convex geometry, local Part poses, physical Material values, and generic fixed/revolute/prismatic connections. It contains no ability flags.

Core must not import Three.js or Rapier runtime objects. Rendering and physics are adapters around Morphodyne state, not the owner of simulation semantics.
