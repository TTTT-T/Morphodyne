import { describe, expect, it, vi } from 'vitest';
import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import { FixedStepSimulation } from './FixedStepSimulation';

describe('fixed-step simulation', () => {
  it('owns tick timing, pause and single-step', () => {
    const step = vi.fn();
    const physics = { step } as unknown as PhysicsAdapter;
    const simulation = new FixedStepSimulation(physics);
    expect(simulation.advance(1 / 30)).toBe(2);
    expect(step).toHaveBeenCalledTimes(2);
    expect(step).toHaveBeenCalledWith(1 / 60);
    simulation.paused = true;
    expect(simulation.advance(1)).toBe(0);
    simulation.stepOnce();
    expect(simulation.tick).toBe(3);
  });

  it('slows time without changing the physics step size', () => {
    const step = vi.fn();
    const simulation = new FixedStepSimulation({ step } as unknown as PhysicsAdapter);
    simulation.setTimeScale(0.5);
    expect(simulation.advance(1 / 30)).toBe(1);
    expect(step).toHaveBeenCalledWith(1 / 60);
    expect(() => simulation.setTimeScale(0)).toThrow();
  });
});
