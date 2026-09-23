# Core

Framework-independent Morphodyne domain rules belong here. Phase 0 defines structural data, factual events, and Blueprint validation in `model.ts`.

Core must not import Three.js or Rapier runtime objects. Rendering and physics are adapters around Morphodyne state, not the owner of simulation semantics.
