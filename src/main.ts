import './style.css';
import type { Entity } from './core/model';
import { RapierPhysicsAdapter } from './physics/RapierPhysicsAdapter';
import { ThreeSmokeRenderer } from './rendering/ThreeSmokeRenderer';
import { FixedStepSimulation } from './simulation/FixedStepSimulation';
import { consoleLogSink } from './tools/logging';
import { createPassiveBlueprint } from './tools/smokeScene';

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app root element');
  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');
  app.append(status);

  const physics = await RapierPhysicsAdapter.create();
  const renderer = new ThreeSmokeRenderer(app);
  const groundSpec = {
    halfExtents: { x: 8, y: 0.1, z: 8 },
    position: { x: 0, y: -0.1, z: 0 },
    dynamic: false,
  } as const;
  const ground = physics.createBox(groundSpec);
  renderer.addBox(ground, groundSpec.halfExtents, 0x343b46);
  renderer.setPose(ground, physics.readPose(ground));

  const entity: Entity = {
    id: 'entity-passive-assembly',
    blueprint: createPassiveBlueprint(),
  };
  const body = physics.createBody(entity, { x: 0, y: 0.65, z: 0 });
  for (const part of entity.blueprint.parts) {
    const handle = body.partHandles.get(part.id);
    if (handle === undefined) throw new Error(`Missing runtime handle for part: ${part.id}`);
    renderer.addPart(handle, part.geometry, 0x9eb7c9);
    renderer.setPose(handle, body.readPartPose(part.id));
  }
  const simulation = new FixedStepSimulation(physics);
  consoleLogSink.write({ level: 'info', source: 'smoke', message: 'Rapier and Three.js ready' });

  let previousTime: number | undefined;
  function frame(now: number): void {
    const elapsed = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    simulation.advance(elapsed);
    for (const part of entity.blueprint.parts) {
      const handle = body.partHandles.get(part.id);
      if (handle === undefined) throw new Error(`Missing runtime handle for part: ${part.id}`);
      renderer.setPose(handle, body.readPartPose(part.id));
    }
    const rootPose = body.readPartPose(entity.blueprint.parts[0].id);
    renderer.render();
    status.textContent = `Morphodyne Phase 1 · tick ${simulation.tick} · parts ${entity.blueprint.parts.length} · core y ${rootPose.position.y.toFixed(2)}`;
    status.dataset.tick = String(simulation.tick);
    status.dataset.coreY = String(rootPose.position.y);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main().catch((error: unknown) => {
  consoleLogSink.write({ level: 'error', source: 'bootstrap', message: String(error) });
  const app = document.querySelector('#app');
  if (app) app.textContent = `Smoke scene failed: ${String(error)}`;
});
