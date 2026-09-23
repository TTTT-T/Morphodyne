import { describe, expect, it } from 'vitest';
import type { Blueprint, Pose, Sensor } from './model';
import { validateBlueprint } from './model';
import { canUseObservation, isPerceptionCurrent, reachablePartIds, reachableSensorIds } from './sensing';

const identityPose: Pose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

const base: Blueprint = {
  id: 'sensing-body',
  materials: [{ id: 'mat', density: 1000, friction: 0.5, restitution: 0.1 }],
  parts: ['core', 'limb', 'tip'].map((id, index) => ({
    id,
    materialId: 'mat',
    geometry: { kind: 'box' as const, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    pose: { ...identityPose, position: { x: index, y: 0, z: 0 } },
  })),
  connections: [
    { id: 'core-limb', kind: 'rigid', fromPartId: 'core', toPartId: 'limb', fromAnchor: { x: 0.5, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 } },
    { id: 'limb-tip', kind: 'rigid', fromPartId: 'limb', toPartId: 'tip', fromAnchor: { x: 0.5, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 } },
  ],
};

function sensor(id: string, partId: string, kind: Sensor['kind'] = 'range'): Sensor {
  const common = {
    id, partId, localPose: identityPose, forward: { x: 0, y: 0, z: 1 },
    updatePeriodTicks: 2, noise: { standardDeviation: 0.1 }, latencyTicks: 1,
  };
  if (kind === 'contact') return { ...common, kind, range: 0.1, resolution: 1 };
  if (kind === 'proprioception') return { ...common, kind, resolution: 3 };
  return { ...common, kind, range: 10, fieldOfViewRadians: Math.PI / 2, resolution: 8 };
}

describe('sensor model and structural perception gating', () => {
  it('validates mounted contact, proprioception, and range declarations', () => {
    const withSensors: Blueprint = {
      ...base,
      sensors: [sensor('touch', 'tip', 'contact'), sensor('joint-state', 'limb', 'proprioception'), sensor('distance', 'core')],
    };
    expect(validateBlueprint(withSensors)).toEqual([]);
  });

  it('rejects duplicate IDs, unknown mounts, and invalid sensor parameters', () => {
    const invalid: Blueprint = {
      ...base,
      sensors: [
        sensor('duplicate', 'core'),
        { ...sensor('duplicate', 'missing'), kind: 'range', range: 0, fieldOfViewRadians: 8, resolution: 0 },
      ],
    };
    expect(validateBlueprint(invalid)).toEqual([
      'Invalid or duplicate sensor id: duplicate',
      'Unknown sensor part: duplicate',
      'Invalid sensor range: duplicate',
      'Invalid sensor fieldOfViewRadians: duplicate',
      'Invalid sensor resolution: duplicate',
    ]);
  });

  it('only exposes sensors in the root Part current connected component', () => {
    const body: Blueprint = { ...base, sensors: [sensor('body-sensor', 'core'), sensor('limb-sensor', 'limb'), sensor('tip-sensor', 'tip')] };
    const active = new Set(['core-limb', 'limb-tip']);
    expect(reachablePartIds(body, 'core', active)).toEqual(['core', 'limb', 'tip']);
    expect(reachableSensorIds(body, 'core', active)).toEqual(['body-sensor', 'limb-sensor', 'tip-sensor']);

    active.delete('limb-tip');
    expect(reachablePartIds(body, 'core', active)).toEqual(['core', 'limb']);
    expect(reachableSensorIds(body, 'core', active)).toEqual(['body-sensor', 'limb-sensor']);
    expect(reachableSensorIds(body, 'tip', active)).toEqual(['tip-sensor']);
  });

  it('gates observations by sensor reachability and age', () => {
    const body: Blueprint = { ...base, sensors: [sensor('tip-sensor', 'tip')] };
    const observation = {
      sensorId: 'tip-sensor', tick: 10, timestampSeconds: 0.2,
      values: [2.4], uncertainty: [0.1],
    };
    const active = new Set(['core-limb', 'limb-tip']);
    expect(canUseObservation(body, 'core', active, observation, 12, 2)).toBe(true);
    expect(canUseObservation(body, 'core', active, observation, 13, 2)).toBe(false);
    expect(canUseObservation(body, 'core', active, { ...observation, tick: 13 }, 12, 2)).toBe(false);
    active.delete('limb-tip');
    expect(canUseObservation(body, 'core', active, observation, 11, 2)).toBe(false);
  });

  it('expires interpretations independently of their source observations', () => {
    const perception = {
      tick: 4, expiresAtTick: 7, label: 'uncertain-return', confidence: 0.6,
      values: [3], uncertainty: [0.5],
    };
    expect(isPerceptionCurrent(perception, 7)).toBe(true);
    expect(isPerceptionCurrent(perception, 8)).toBe(false);
    expect(isPerceptionCurrent(perception, 3)).toBe(false);
  });
});
