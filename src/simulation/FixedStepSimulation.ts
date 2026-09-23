import type { PhysicsAdapter } from '../physics/PhysicsAdapter';

/** Morphodyne owns time. The backend only executes requested fixed steps. */
export class FixedStepSimulation {
  readonly fixedSeconds = 1 / 60;
  tick = 0;
  paused = false;
  timeScale = 1;
  private accumulator = 0;

  constructor(private readonly physics: PhysicsAdapter) {}

  advance(elapsedSeconds: number): number {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Elapsed time must be nonnegative and finite');
    if (this.paused) return 0;
    this.accumulator += Math.min(elapsedSeconds, 0.1) * this.timeScale;
    let steps = 0;
    while (this.accumulator >= this.fixedSeconds && steps < 12) {
      this.stepOnce();
      this.accumulator -= this.fixedSeconds;
      steps++;
    }
    return steps;
  }

  stepOnce(): void {
    this.physics.step(this.fixedSeconds);
    this.tick++;
  }

  setTimeScale(value: number): void {
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error('Time scale must be in (0, 1]');
    this.timeScale = value;
  }
}
