import { describe, expect, it, vi } from 'vitest';
import type { Blueprint } from '../core/model';
import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsBody } from '../physics/PhysicsBody';
import { JointActuatorRuntime } from './JointActuatorRuntime';

const blueprint = {
  actuators: [{ id: 'drive', connectionId: 'joint', maxOutput: 10 }],
} as unknown as Blueprint;
const body = {} as PhysicsBody;

describe('joint actuator runtime', () => {
  it('caps output by actuator strength and available mechanical power', () => {
    const applyJointOutput = vi.fn();
    const physics = { readJointVelocity: () => 4, applyJointOutput } as unknown as PhysicsAdapter;
    const runtime = new JointActuatorRuntime(blueprint, physics, body, { availablePowerWatts: 20 });
    runtime.step([{ actuatorId: 'drive', value: 1 }], 1 / 60);
    expect(applyJointOutput).toHaveBeenCalledWith(body, 'joint', 5);
  });

  it('removes output when power is unavailable and rejects invalid signals', () => {
    const applyJointOutput = vi.fn();
    const physics = { readJointVelocity: () => 0, applyJointOutput } as unknown as PhysicsAdapter;
    const runtime = new JointActuatorRuntime(blueprint, physics, body, { availablePowerWatts: 0 });
    runtime.step([{ actuatorId: 'drive', value: 1 }], 1 / 60);
    expect(applyJointOutput).toHaveBeenCalledWith(body, 'joint', 0);
    expect(() => runtime.step([{ actuatorId: 'drive', value: 2 }], 1 / 60)).toThrow();
  });
});
