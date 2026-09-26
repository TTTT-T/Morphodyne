import { describe, expect, it } from 'vitest';
import { validateBlueprint } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { createLeopardBlueprint } from './LeopardBlueprint';

const expectedPartIds = [
  'leopard-chest', 'leopard-pelvis', 'leopard-neck', 'leopard-head', 'leopard-jaw',
  'leopard-tail-1', 'leopard-tail-2', 'leopard-tail-3',
  'leopard-front-left-upper', 'leopard-front-left-lower', 'leopard-front-left-paw',
  'leopard-front-right-upper', 'leopard-front-right-lower', 'leopard-front-right-paw',
  'leopard-hind-left-upper', 'leopard-hind-left-lower', 'leopard-hind-left-paw',
  'leopard-hind-right-upper', 'leopard-hind-right-lower', 'leopard-hind-right-paw',
];

describe('LeopardBlueprint', () => {
  it('builds a valid 20-Part generic articulated body with required channels', () => {
    const blueprint = createLeopardBlueprint();

    expect(validateBlueprint(blueprint)).toEqual([]);
    expect(blueprint.parts.map((part) => part.id)).toEqual(expectedPartIds);
    expect(blueprint.parts).toHaveLength(20);
    expect(blueprint.parts.every((part) => part.mass !== undefined && part.mass > 0)).toBe(true);

    const requiredActuators = [
      'leopard-front-left-hip', 'leopard-front-right-hip',
      'leopard-hind-left-hip', 'leopard-hind-right-hip',
      'leopard-front-left-knee', 'leopard-front-right-knee',
      'leopard-hind-left-knee', 'leopard-hind-right-knee',
      'leopard-jaw-close', 'leopard-neck-pitch', 'leopard-spine-pitch',
    ];
    expect(blueprint.actuators?.map((actuator) => actuator.id)).toEqual(expect.arrayContaining(requiredActuators));

    const sensors = blueprint.sensors ?? [];
    expect(sensors.find((sensor) => sensor.id === 'leopard-torso-proprioception')?.kind).toBe('proprioception');
    expect(sensors.filter((sensor) => sensor.id.endsWith('-paw-contact'))).toHaveLength(4);
    expect(sensors.map((sensor) => sensor.id)).toEqual(expect.arrayContaining([
      'leopard-head-contact', 'leopard-jaw-contact', 'leopard-head-range',
    ]));
    expect(sensors.find((sensor) => sensor.id === 'leopard-head-range')).toMatchObject({
      kind: 'range', forward: { x: 1, y: 0, z: 0 },
    });
    expect(blueprint.parts.filter((part) => part.pose.position.y - (
      part.geometry.kind === 'box' ? part.geometry.halfExtents.y : 0
    ) === 0)).toHaveLength(4);
  });

  it('constrains each generic spherical body joint on pitch, roll, and yaw', () => {
    const blueprint = createLeopardBlueprint();
    const spherical = blueprint.connections.filter((connection) => connection.kind === 'spherical');

    expect(spherical).toHaveLength(5);
    for (const connection of spherical) {
      expect(connection.angularLimits).toHaveLength(3);
      expect(connection.angularLimits?.map((limit) => limit.axis)).toEqual(expect.arrayContaining([
        { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
      ]));
      expect(connection.angularLimits?.every((limit) => limit.min < 0 && limit.max > 0
        && limit.stiffnessNmPerRad > 0 && limit.dampingNmsPerRad >= 0 && limit.maxTorqueNm > 0)).toBe(true);
    }
    expect(spherical.find((connection) => connection.id === 'leopard-spine-joint')?.angularLimits)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ axis: { x: 0, y: 0, z: 1 }, min: -0.38, max: 0.38 }),
      ]));
  });

  it('rotates the complete body for a facing -X instance while retaining local channels', () => {
    const forward = createLeopardBlueprint();
    const reverse = createLeopardBlueprint({ facing: -1 });

    expect(validateBlueprint(reverse)).toEqual([]);
    for (const part of forward.parts) {
      const opposite = reverse.parts.find((candidate) => candidate.id === part.id)!;
      expect(opposite.pose.position).toEqual({
        x: -part.pose.position.x,
        y: part.pose.position.y,
        z: -part.pose.position.z,
      });
      expect(opposite.pose.rotation).toEqual({ x: 0, y: 1, z: 0, w: 0 });
    }
    expect(reverse.connections.map((connection) => connection.id)).toEqual(forward.connections.map((connection) => connection.id));
    expect(reverse.actuators?.map((actuator) => actuator.id)).toEqual(forward.actuators?.map((actuator) => actuator.id));
    expect(reverse.sensors?.find((sensor) => sensor.id === 'leopard-head-range')?.forward).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('maps both orientations through the generic Rapier body adapter', async () => {
    const physics = await RapierPhysicsAdapter.create();
    for (const [index, blueprint] of [createLeopardBlueprint(), createLeopardBlueprint({ facing: -1 })].entries()) {
      const body = physics.createBody({ id: `leopard-${index}`, blueprint });
      physics.step(1 / 60);
      for (const part of blueprint.parts) {
        const pose = body.readPartPose(part.id);
        expect(Object.values(pose.position).every(Number.isFinite)).toBe(true);
      }
      physics.removeBody(body);
    }
  });
});
