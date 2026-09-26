import { describe, expect, it } from 'vitest';
import type { Blueprint, Pose } from './model';
import {
  createControlSignal,
  type ControlSignal,
  type MotorPrimitive,
  validateControlSignal,
  validateEnergySourceSpec,
} from './actuation';
import { validateBlueprint } from './model';

const identityPose: Pose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

function actuatorBlueprint(): Blueprint {
  return {
    id: 'actuated',
    materials: [{ id: 'mat', density: 1000, friction: 0.6, restitution: 0.1 }],
    parts: [
      { id: 'base', materialId: 'mat', geometry: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }, pose: identityPose },
      { id: 'link', materialId: 'mat', geometry: { kind: 'box', halfExtents: { x: 0.5, y: 0.1, z: 0.1 } }, pose: identityPose },
    ],
    connections: [{
      id: 'hinge',
      kind: 'revolute',
      fromPartId: 'base',
      toPartId: 'link',
      fromAnchor: { x: 0, y: 0, z: 0 },
      toAnchor: { x: 0, y: 0, z: 0 },
      axis: { x: 0, y: 0, z: 1 },
    }],
    actuators: [{ id: 'hinge-motor', connectionId: 'hinge', maxOutput: 2.5, responseTimeSeconds: 0.1 }],
  };
}

describe('Core actuation contract', () => {
  it('validates finite joules, watts, and conversion efficiency independently', () => {
    expect(validateEnergySourceSpec({ capacityJ: 20, initialEnergyJ: 5, maxPowerWatts: 10, efficiency: 0.5 }))
      .toEqual([]);
    expect(validateEnergySourceSpec({ capacityJ: -1, initialEnergyJ: 2, maxPowerWatts: -2, efficiency: 0 }))
      .toEqual([
        'Energy capacity must be finite and nonnegative',
        'Initial energy must be finite and within capacity',
        'Maximum power must be finite and nonnegative',
        'Energy efficiency must be finite and in (0, 1]',
      ]);
    expect(validateEnergySourceSpec({ capacityJ: Number.POSITIVE_INFINITY, maxPowerWatts: 10, efficiency: 1 }))
      .toContain('Energy capacity must be finite and nonnegative');
  });

  it('keeps actuators optional so passive Phase 1 blueprints remain valid', () => {
    const passive: Blueprint = { ...actuatorBlueprint(), actuators: undefined };
    expect(validateBlueprint(passive)).toEqual([]);
  });

  it('validates actuator references, output limits, response time, and duplicate ids', () => {
    const invalid: Blueprint = {
      ...actuatorBlueprint(),
      actuators: [
        { id: 'duplicate', connectionId: 'hinge', maxOutput: 1 },
        { id: 'duplicate', connectionId: 'missing', maxOutput: 0 },
        { id: 'rigid-motor', connectionId: 'rigid', maxOutput: 1, responseTimeSeconds: Number.NaN },
      ],
      connections: [...actuatorBlueprint().connections, {
        id: 'rigid',
        kind: 'rigid',
        fromPartId: 'base',
        toPartId: 'link',
        fromAnchor: { x: 0, y: 0, z: 0 },
        toAnchor: { x: 0, y: 0, z: 0 },
      }],
    };
    expect(validateBlueprint(invalid)).toEqual([
      'Invalid or duplicate actuator id: duplicate',
      'Invalid actuator maxOutput: duplicate',
      'Unknown actuator connection: duplicate',
      'Invalid actuator responseTimeSeconds: rigid-motor',
      'Actuator requires a movable connection: rigid-motor',
    ]);
  });

  it('accepts a prismatic actuator and rejects rigid references', () => {
    const blueprint = actuatorBlueprint();
    const prismatic: Blueprint = {
      ...blueprint,
      parts: [...blueprint.parts, {
        id: 'slider',
        materialId: 'mat',
        geometry: { kind: 'box', halfExtents: { x: 0.1, y: 0.1, z: 0.1 } },
        pose: { ...identityPose, position: { x: 1, y: 0, z: 0 } },
      }],
      connections: [...blueprint.connections, {
        id: 'slide',
        kind: 'prismatic',
        fromPartId: 'base',
        toPartId: 'slider',
        fromAnchor: { x: 0, y: 0, z: 0 },
        toAnchor: { x: -1, y: 0, z: 0 },
        axis: { x: 1, y: 0, z: 0 },
      }],
      actuators: [{ id: 'slider-motor', connectionId: 'slide', maxOutput: 20 }],
    };
    expect(validateBlueprint(prismatic)).toEqual([]);
  });

  it('validates Part-local tension attachments without a Connection dependency', () => {
    const source = actuatorBlueprint();
    const tension = { id: 'pull', kind: 'tension' as const, fromPartId: 'base', toPartId: 'link',
      fromAttachment: { x: 0, y: 0.4, z: 0 }, toAttachment: { x: 0.3, y: 0, z: 0 }, maxOutput: 20 };
    expect(validateBlueprint({ ...source, connections: [], actuators: [tension] })).toEqual([]);
    expect(validateBlueprint({ ...source, actuators: [{ ...tension, toPartId: 'missing' }] }))
      .toContain('Unknown tension actuator endpoint: pull');
    expect(validateBlueprint({ ...source, actuators: [{ ...tension, toPartId: 'base' }] }))
      .toContain('Self tension actuator: pull');
    expect(validateBlueprint({ ...source, actuators: [{ ...tension, fromAttachment: { x: Number.NaN, y: 0, z: 0 } }] }))
      .toContain('Invalid tension actuator attachment: pull');
    expect(validateBlueprint({ ...source, actuators: [{ ...tension, maxOutput: 0, responseTimeSeconds: -1 }] }))
      .toEqual(expect.arrayContaining(['Invalid actuator maxOutput: pull', 'Invalid actuator responseTimeSeconds: pull']));
  });

  it('creates only normalized control signals', () => {
    const signal = createControlSignal('hinge-motor', -1);
    expect(signal).toEqual({ actuatorId: 'hinge-motor', value: -1 });
    expect(validateControlSignal({ actuatorId: 'hinge-motor', value: 1 })).toEqual([]);
    expect(validateControlSignal({ actuatorId: 'hinge-motor', value: 1.01 })).toEqual(['Invalid control signal value: hinge-motor']);
    expect(() => createControlSignal('hinge-motor', Number.NaN)).toThrow('Invalid control signal value: hinge-motor');
  });

  it('lets a Motor Primitive yield signals without defining an action or outcome', () => {
    const primitive: MotorPrimitive = {
      id: 'symmetric-drive',
      actuatorIds: ['a', 'b'],
      generateSignals: (input) => [
        createControlSignal('a', input),
        createControlSignal('b', input),
      ],
    };
    const signals: readonly ControlSignal[] = primitive.generateSignals(0.5);
    expect(signals).toEqual([
      { actuatorId: 'a', value: 0.5 },
      { actuatorId: 'b', value: 0.5 },
    ]);
  });
});
