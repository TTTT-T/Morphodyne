import type { EnvironmentSpec } from '../core/environment';

/** Default browser experiment: adjacent dry, low-friction, and sloped ground. */
export const environmentScene: EnvironmentSpec = {
  surfaces: [
    {
      id: 'surface-dry',
      halfExtents: { x: 2.5, y: 0.1, z: 6 },
      position: { x: -4.5, y: -0.1, z: 0 },
      friction: 0.9,
      wetFriction: 0.5,
    },
    {
      id: 'surface-slippery',
      halfExtents: { x: 2.5, y: 0.1, z: 6 },
      position: { x: 0.5, y: -0.1, z: 0 },
      friction: 0.08,
      wetFriction: 0.04,
    },
    {
      id: 'surface-slope',
      halfExtents: { x: 2.5, y: 0.1, z: 6 },
      position: { x: 5.5, y: 0.3, z: 0 },
      rotation: { x: 0, y: 0, z: Math.sin(0.06), w: Math.cos(0.06) },
      friction: 0.65,
      wetFriction: 0.32,
    },
  ],
  volumes: [
    {
      id: 'volume-water',
      min: { x: -2, y: 0, z: -5 },
      max: { x: 2.8, y: 1.8, z: -1 },
      // Blueprint masses and dimensions are intentionally lightweight; this
      // scaled density exercises buoyancy without launching the sensor fixture.
      density: 2,
      drag: 5,
    },
  ],
  fields: [],
  state: { weather: 'clear', timeOfDay: 12 },
};
