import './style.css';
import { RapierPhysicsAdapter } from './physics/RapierPhysicsAdapter';
import { ThreeSmokeRenderer } from './rendering/ThreeSmokeRenderer';
import { FixedStepSimulation } from './simulation/FixedStepSimulation';
import { consoleLogSink } from './tools/logging';
import { createSmokeScene } from './tools/smokeScene';

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app root element');
  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');
  app.append(status);

  const physics = await RapierPhysicsAdapter.create();
  const renderer = new ThreeSmokeRenderer(app);
  const cube = createSmokeScene(physics, renderer);
  const simulation = new FixedStepSimulation(physics);
  consoleLogSink.write({ level: 'info', source: 'smoke', message: 'Rapier and Three.js ready' });

  let previousTime: number | undefined;
  function frame(now: number): void {
    const elapsed = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    simulation.advance(elapsed);
    const pose = physics.readPose(cube);
    renderer.setPose(cube, pose);
    renderer.render();
    status.textContent = `Morphodyne Phase 0 · tick ${simulation.tick} · cube y ${pose.position.y.toFixed(2)}`;
    status.dataset.tick = String(simulation.tick);
    status.dataset.cubeY = String(pose.position.y);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main().catch((error: unknown) => {
  consoleLogSink.write({ level: 'error', source: 'bootstrap', message: String(error) });
  const app = document.querySelector('#app');
  if (app) app.textContent = `Smoke scene failed: ${String(error)}`;
});
