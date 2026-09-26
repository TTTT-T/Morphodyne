import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Blueprint, Connection, Entity, Material, Part, Vector3 } from '../core/model';
import { validateBlueprint } from '../core/model';
import { RapierPhysicsAdapter } from './RapierPhysicsAdapter';

const identity = { x: 0, y: 0, z: 0, w: 1 } as const;
const material: Material = { id: 'machine-metal', density: 1_000, friction: 0.6, restitution: 0 };

function part(id: string, position: Vector3): Part {
  return {
    id,
    materialId: material.id,
    geometry: { kind: 'box', halfExtents: { x: 0.3, y: 0.3, z: 0.3 } },
    pose: { position, rotation: identity },
    mass: 1,
  };
}

function machine(connection: Connection, actuators?: Blueprint['actuators']): Entity {
  return {
    id: 'generic-ball-machine',
    blueprint: {
      id: 'generic-ball-machine',
      materials: [material],
      parts: [part('base', { x: 0, y: 4, z: 0 }), part('link', { x: 0.6, y: 4, z: 0 })],
      connections: [connection],
      ...(actuators ? { actuators } : {}),
    },
  };
}

const ballConnection = (passiveAngular?: Connection['passiveAngular']): Connection => ({
  id: 'ball',
  kind: 'spherical',
  fromPartId: 'base',
  toPartId: 'link',
  fromAnchor: { x: 0.3, y: 0, z: 0 },
  toAnchor: { x: -0.3, y: 0, z: 0 },
  ...(passiveAngular ? { passiveAngular } : {}),
});

describe('generic spherical connections', () => {
  it('uses the public Rapier 0.20 spherical descriptor and observes its runtime generic joint', async () => {
    await RAPIER.init();
    const descriptor = RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(descriptor.jointType).toBe(RAPIER.JointType.Spherical);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const from = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
    const to = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
    const joint = world.createImpulseJoint(descriptor, from, to, true);
    expect(joint.type()).toBe(RAPIER.JointType.Generic);
    expect(typeof (joint as unknown as { configureMotorPosition?: unknown }).configureMotorPosition).toBe('undefined');
  });

  it('exposes independent orthogonal angular coordinates and actuator axes', async () => {
    async function deflection(axis: Vector3): Promise<{ x: number; y: number; z: number }> {
      const physics = await RapierPhysicsAdapter.create();
      const body = physics.createBody(machine(ballConnection(), [
        { id: 'ball-motor', connectionId: 'ball', maxOutput: 8, axis },
      ]));
      physics.applyJointOutput(body, 'ball', 8, axis);
      physics.step(1 / 60);
      return {
        x: physics.readJointPosition(body, 'ball', { x: 1, y: 0, z: 0 }),
        y: physics.readJointPosition(body, 'ball', { x: 0, y: 1, z: 0 }),
        z: physics.readJointPosition(body, 'ball', { x: 0, y: 0, z: 1 }),
      };
    }

    const x = await deflection({ x: 1, y: 0, z: 0 });
    const y = await deflection({ x: 0, y: 1, z: 0 });
    expect(Math.abs(x.x)).toBeGreaterThan(1e-4);
    expect(Math.abs(y.y)).toBeGreaterThan(1e-4);
    expect(Math.abs(x.y)).toBeLessThan(Math.abs(x.x) * 0.2);
    expect(Math.abs(y.x)).toBeLessThan(Math.abs(y.y) * 0.2);
  });

  it('returns a deflected passive joint toward rest while damping angular motion', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(machine(ballConnection([{
      axis: { x: 0, y: 0, z: 1 },
      restAngle: 0,
      stiffnessNmPerRad: 22,
      dampingNmsPerRad: 25,
      maxTorqueNm: 10,
    }])));
    const link = body.partHandles.get('link')!;
    physics.applyTorqueImpulse(link, { x: 0, y: 0, z: 0.45 });
    physics.step(1 / 60);
    const initialAngle = Math.abs(physics.readJointPosition(body, 'ball', { x: 0, y: 0, z: 1 }));
    const initialVelocity = Math.abs(physics.readJointVelocity(body, 'ball', { x: 0, y: 0, z: 1 }));
    let peakPassiveLoadNm = 0;
    for (let tick = 0; tick < 30; tick += 1) {
      physics.step(1 / 60);
      peakPassiveLoadNm = Math.max(peakPassiveLoadNm, physics.readConnectionLoad(body, 'ball').torqueNm);
    }
    const finalAngle = Math.abs(physics.readJointPosition(body, 'ball', { x: 0, y: 0, z: 1 }));
    const finalVelocity = Math.abs(physics.readJointVelocity(body, 'ball', { x: 0, y: 0, z: 1 }));

    expect(initialAngle).toBeGreaterThan(1e-3);
    expect(finalAngle).toBeLessThan(initialAngle * 0.35);
    expect(finalVelocity).toBeLessThan(initialVelocity);
    expect(peakPassiveLoadNm).toBeGreaterThan(0);
  });

  it('validates spherical, passive support, and spherical actuator declarations', () => {
    const valid = machine(ballConnection([{
      axis: { x: 0, y: 0, z: 1 }, restAngle: 0,
      stiffnessNmPerRad: 4, dampingNmsPerRad: 0,
    }]), [{ id: 'drive', connectionId: 'ball', maxOutput: 2, axis: { x: 1, y: 0, z: 0 } }]);
    expect(validateBlueprint(valid.blueprint)).toEqual([]);

    expect(validateBlueprint({
      ...valid.blueprint,
      connections: [ballConnection([{
        axis: { x: 0, y: 0, z: 0 }, restAngle: Number.NaN,
        stiffnessNmPerRad: 0, dampingNmsPerRad: -1, maxTorqueNm: 0,
      }])],
    })).toEqual(expect.arrayContaining([
      'Invalid passiveAngular axis: ball',
      'Invalid passiveAngular restAngle: ball',
      'Invalid passiveAngular stiffness: ball',
      'Invalid passiveAngular damping: ball',
      'Invalid passiveAngular maxTorqueNm: ball',
    ]));

    expect(validateBlueprint({
      ...valid.blueprint,
      actuators: [{ id: 'drive', connectionId: 'ball', maxOutput: 2 }],
    })).toContain('Spherical actuator requires a nonzero axis: drive');

    const hinge: Connection = { ...ballConnection(), kind: 'revolute', axis: { x: 0, y: 0, z: 1 } };
    expect(validateBlueprint({
      ...valid.blueprint,
      connections: [hinge],
    })).toContain('Actuator axis requires a spherical connection: drive');
  });
});
