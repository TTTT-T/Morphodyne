import { describe, expect, it } from 'vitest';
import { EnergyRuntime } from './EnergyRuntime';

describe('EnergyRuntime', () => {
  it('caps a step by both watts and available joules, never overdrawing', () => {
    const energy = new EnergyRuntime({ capacityJ: 10, maxPowerWatts: 4, efficiency: 0.5 });
    expect(energy.allocate(20, 1)).toBeCloseTo(0.2);
    expect(energy.state).toMatchObject({ remainingEnergyJ: 2, consumedEnergyJ: 8,
      stepPowerLimitWatts: 4, stepMechanicalPowerWatts: 4, stepEnergyDrawJ: 8 });
    expect(energy.allocate(20, 1)).toBeCloseTo(0.05);
    expect(energy.state).toMatchObject({ remainingEnergyJ: 0, consumedEnergyJ: 10,
      stepPowerLimitWatts: 1, stepMechanicalPowerWatts: 1, stepEnergyDrawJ: 2 });
    expect(energy.allocate(20, 1)).toBe(0);
    expect(energy.state.stepMechanicalPowerWatts).toBe(0);
  });

  it('draws only for positive requested mechanical work and never recharges', () => {
    const energy = new EnergyRuntime({ capacityJ: 10, initialEnergyJ: 6, maxPowerWatts: 100, efficiency: 1 });
    expect(energy.allocate(0, 1)).toBe(1);
    expect(energy.state).toMatchObject({ remainingEnergyJ: 6, consumedEnergyJ: 0, stepEnergyDrawJ: 0 });
    energy.allocate(3, 1);
    expect(energy.state).toMatchObject({ remainingEnergyJ: 3, consumedEnergyJ: 3 });
    energy.allocate(0, 1);
    expect(energy.state).toMatchObject({ remainingEnergyJ: 3, consumedEnergyJ: 3 });
  });

  it('rejects invalid supply declarations and step inputs', () => {
    expect(() => new EnergyRuntime({ capacityJ: 1, maxPowerWatts: 1, efficiency: 0 })).toThrow();
    const energy = new EnergyRuntime({ capacityJ: 1, maxPowerWatts: 1, efficiency: 1 });
    expect(() => energy.allocate(-1, 1)).toThrow();
    expect(() => energy.allocate(1, 0)).toThrow();
  });
});
