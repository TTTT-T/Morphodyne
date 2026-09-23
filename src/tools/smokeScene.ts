import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { ThreeSmokeRenderer } from '../rendering/ThreeSmokeRenderer';

/** Technical adapter check; structural Blueprint mapping begins in Phase 1. */
export function createSmokeScene(physics: PhysicsAdapter, renderer: ThreeSmokeRenderer): number {
  const groundSpec = {
    halfExtents: { x: 8, y: 0.1, z: 8 },
    position: { x: 0, y: -0.1, z: 0 },
    dynamic: false,
  };
  const cubeSpec = {
    halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    position: { x: 0, y: 4, z: 0 },
    dynamic: true,
  };
  const ground = physics.createBox(groundSpec);
  const cube = physics.createBox(cubeSpec);
  renderer.addBox(ground, groundSpec.halfExtents, 0x343b46);
  renderer.addBox(cube, cubeSpec.halfExtents, 0xd8d8d8);
  renderer.setPose(ground, physics.readPose(ground));
  renderer.setPose(cube, physics.readPose(cube));
  return cube;
}
