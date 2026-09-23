import { describe, expect, it } from 'vitest';
import { createDamageState } from '../core/damage';
import type { Entity } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { createActiveBlueprint } from './activeBody';
import { SensorRuntime } from '../simulation/SensorRuntime';
import { StructuralDamageRuntime } from '../simulation/StructuralDamageRuntime';

describe('SensorRuntime boundary', () => {
  it('emits contact measurements only after a real collision', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 3, y: 0.1, z: 3 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    const blueprint = {
      id: 'contact-body',
      materials: [{ id: 'mat', density: 500, friction: 0.5, restitution: 0 }],
      parts: [{ id: 'root', materialId: 'mat', geometry: { kind: 'box' as const, halfExtents: { x: 0.2, y: 0.2, z: 0.2 } },
        pose: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }],
      connections: [],
      sensors: [{ id: 'touch', kind: 'contact' as const, partId: 'root',
        localPose: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
        forward: { x: 0, y: -1, z: 0 }, range: 0.4, resolution: 100,
        updatePeriodTicks: 1, latencyTicks: 0, noise: { standardDeviation: 0 } }],
    };
    const body = physics.createBody({ id: 'body', blueprint });
    const sensors = new SensorRuntime(blueprint, 'root', physics, body, () => createDamageState(blueprint));
    physics.applyImpulse(body.partHandles.get('root')!, { x: 0.1, y: 0, z: 0 });
    physics.step(1 / 60);
    sensors.afterPhysicsStep(0, 1 / 60);
    expect(sensors.readAgentView().perceptions.filter((entry) => entry.channel === 'contact')).toEqual([]);
    let measured = false;
    for (let tick = 1; tick < 90; tick += 1) {
      physics.step(1 / 60);
      sensors.afterPhysicsStep(tick, 1 / 60);
      const contacts = sensors.readAgentView().perceptions.filter((entry) => entry.channel === 'contact');
      if (contacts.some((entry) => entry.values[3] > 0)) { measured = true; break; }
    }
    expect(measured).toBe(true);
  });

  it('derives contact, proprioception, and range from physics without target truth', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 12, y: 0.1, z: 12 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    physics.createBox({ halfExtents: { x: 0.4, y: 0.4, z: 0.4 }, position: { x: -0.85, y: 1, z: -2.5 }, dynamic: false });
    const blueprint = createActiveBlueprint();
    const body = physics.createBody({ id: 'body', blueprint } satisfies Entity);
    const damage = new StructuralDamageRuntime(blueprint, physics, body);
    const sensors = new SensorRuntime(blueprint, 'part-core', physics, body, () => damage.state, () => 0.5);
    physics.step(1 / 60);
    damage.afterPhysicsStep(0);
    sensors.afterPhysicsStep(0, 1 / 60);
    const observations = sensors.readObservations();
    const orientation = observations.find((item) => item.channel === 'orientation');
    expect(orientation?.values.map((value) => value + 0)).toEqual([0, 0, 0, 1]);
    const joint = observations.find((item) => item.channel === 'joint' && item.ownConnectionId === 'connection-0-a');
    expect(joint?.values[0]).toBeCloseTo(physics.readJointPosition(body, 'connection-0-a'), 1);
    expect(joint?.values[1]).toBeCloseTo(physics.readJointVelocity(body, 'connection-0-a'), 1);
    const relative = observations.find((item) => item.channel === 'relative-pose' && item.ownPartId === 'part-1-a');
    expect(relative?.values[1]).toBeCloseTo(body.readPartPose('part-1-a').position.y - body.readPartPose('part-core').position.y, 1);
    expect(observations.filter((item) => item.channel === 'range').length).toBeGreaterThan(0);
    const view = sensors.readAgentView();
    expect(view.perceptions.some((item) => item.channel === 'range')).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/entityId|blueprint|materialId|damage|targetId|worldPose|physics/);
  });

  it('drops an attached sensor immediately when physics separates its Part', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 12, y: 0.1, z: 12 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    physics.createBox({ halfExtents: { x: 0.4, y: 0.4, z: 0.4 }, position: { x: -0.85, y: 1, z: -2.5 }, dynamic: false });
    const blueprint = createActiveBlueprint();
    const body = physics.createBody({ id: 'body', blueprint });
    const damage = new StructuralDamageRuntime(blueprint, physics, body);
    const sensors = new SensorRuntime(blueprint, 'part-core', physics, body, () => damage.state, () => 0.5);
    physics.step(1 / 60);
    damage.afterPhysicsStep(0);
    sensors.afterPhysicsStep(0, 1 / 60);
    expect(sensors.readActiveSensorIds()).toContain('sensor-forward-range');
    const handle = body.partHandles.get('part-1-a')!;
    physics.applyImpulse(handle, { x: 0, y: 0, z: -3 });
    physics.applyImpulse(body.partHandles.get('part-core')!, { x: 0, y: 0, z: 3 });
    physics.step(1 / 60);
    damage.afterPhysicsStep(1);
    sensors.afterPhysicsStep(1, 1 / 60);
    expect(damage.state.connections['connection-0-a'].connected).toBe(false);
    expect(sensors.readActiveSensorIds()).not.toContain('sensor-forward-range');
    expect(sensors.readAgentView().perceptions.some((item) => item.sensorId === 'sensor-forward-range')).toBe(false);
    // The detached physical Part and its mounted sensor still exist in the world.
    expect(body.partHandles.has('part-1-a')).toBe(true);
  });

  it('clears range observations when a physical target leaves its field', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const blueprint = createActiveBlueprint();
    const body = physics.createBody({ id: 'body', blueprint });
    const damage = createDamageState(blueprint);
    const sensors = new SensorRuntime(blueprint, 'part-core', physics, body, () => damage, () => 0.5);
    const target = physics.createBox({ halfExtents: { x: 0.4, y: 0.4, z: 0.4 }, position: { x: -0.85, y: 1, z: -2.5 }, dynamic: true });
    physics.step(1 / 60);
    sensors.afterPhysicsStep(0, 1 / 60);
    expect(sensors.readAgentView().perceptions.some((item) => item.channel === 'range')).toBe(true);
    physics.applyImpulse(target, { x: 15, y: 0, z: 0 });
    for (let tick = 1; tick <= 6; tick += 1) {
      physics.step(1 / 60);
      sensors.afterPhysicsStep(tick, 1 / 60);
    }
    expect(sensors.readAgentView().perceptions.some((item) => item.channel === 'range')).toBe(false);
  });

  it('uses the mounting Part physical pose for sensor direction', async () => {
    async function measure(rotationYRadians: number): Promise<number> {
      const physics = await RapierPhysicsAdapter.create();
      const half = rotationYRadians / 2;
      const blueprint = {
        id: 'single-sensor-part',
        materials: [{ id: 'mat', density: 500, friction: 0.5, restitution: 0 }],
        parts: [{ id: 'root', materialId: 'mat', geometry: { kind: 'box' as const, halfExtents: { x: 0.2, y: 0.2, z: 0.2 } },
          pose: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) } } }],
        connections: [],
        sensors: [{ id: 'range', kind: 'range' as const, partId: 'root',
          localPose: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
          forward: { x: 0, y: 0, z: -1 }, range: 4, fieldOfViewRadians: 0.1, resolution: 1,
          updatePeriodTicks: 1, latencyTicks: 0, noise: { standardDeviation: 0 } }],
      };
      const body = physics.createBody({ id: 'body', blueprint });
      physics.createBox({ halfExtents: { x: 0.3, y: 0.3, z: 0.3 }, position: { x: -2, y: 1, z: 0 }, dynamic: false });
      const sensors = new SensorRuntime(blueprint, 'root', physics, body, () => createDamageState(blueprint));
      physics.step(1 / 60);
      sensors.afterPhysicsStep(0, 1 / 60);
      return sensors.readAgentView().perceptions.filter((entry) => entry.channel === 'range').length;
    }
    expect(await measure(0)).toBe(0);
    expect(await measure(Math.PI / 2)).toBe(1);
  });
});
