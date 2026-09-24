import { describe, expect, it } from 'vitest';
import type { Blueprint, Connection, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';

const identity = { x: 0, y: 0, z: 0, w: 1 } as const;

function part(id: string, x: number, y: number, halfExtents: Vector3, mass: number): Part {
  return { id, materialId: 'test-material', geometry: { kind: 'box', halfExtents },
    pose: { position: { x, y, z: 0 }, rotation: identity }, mass };
}

function blueprint(parts: readonly Part[], connection: Connection, material: Material, actuators?: Blueprint['actuators']): Blueprint {
  return { id: 'phase9-structure', materials: [material], parts, connections: [connection], ...(actuators ? { actuators } : {}) };
}

function material(): Material {
  return { id: 'test-material', density: 1000, friction: 0.8, restitution: 0,
    yieldImpulseNs: 500, toughnessImpulseNs: 1000 };
}

describe('Phase 9 physical structural load through WorldRuntime', () => {
  it('Experiment A: more hanging mass creates more load and yields the same passive connection', async () => {
    async function run(mass: number) {
      const physics = await RapierPhysicsAdapter.create();
      physics.createBox({ halfExtents: { x: 0.3, y: 0.1, z: 0.3 }, position: { x: 0, y: 1.72, z: 0 }, dynamic: false });
      const world = new WorldRuntime(physics);
      const connection: Connection = { id: 'support', kind: 'rigid', fromPartId: 'base', toPartId: 'weight',
        fromAnchor: { x: 0.5, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 },
        yieldForceN: 25, ultimateForceN: 100, strengthImpulseNs: 1000 };
      world.spawn({ id: 'passive', blueprint: blueprint([
        part('base', 0, 2, { x: 0.18, y: 0.18, z: 0.18 }, 100),
        part('weight', 1, 2, { x: 0.12, y: 0.12, z: 0.12 }, mass),
      ], connection, material()) });
      const body = world.getPhysicsBody('passive');
      let peakForceN = 0;
      for (let tick = 0; tick < 75; tick += 1) {
        world.stepOnce();
        peakForceN = Math.max(peakForceN, physics.readConnectionLoad(body, 'support').forceN);
      }
      return { peakForceN, damage: world.getDamageRuntime('passive').state.connections.support.damage,
        connected: world.getDamageRuntime('passive').state.connections.support.connected };
    }
    const light = await run(1);
    const heavy = await run(5);
    console.info('Phase9 A', { light, heavy });
    expect(heavy.peakForceN).toBeGreaterThan(light.peakForceN * 2);
    expect(light.connected).toBe(true);
    expect(light.damage.deformation).toBe(0);
    expect(heavy.damage.deformation).toBeGreaterThan(0);
  });

  it('Experiment B: a real obstruction raises load on the same non-Agent actuator joint', async () => {
    async function run(blocked: boolean, damageEnabled = false) {
      const physics = await RapierPhysicsAdapter.create();
      physics.createBox({ halfExtents: { x: 0.3, y: 0.1, z: 0.3 }, position: { x: 0, y: 1.72, z: 0 }, dynamic: false });
      if (blocked) physics.createBox({ halfExtents: { x: 0.12, y: 0.05, z: 0.25 },
        position: { x: 1.05, y: 2.32, z: 0 }, dynamic: false });
      const world = new WorldRuntime(physics);
      const connection: Connection = { id: 'hinge', kind: 'revolute', fromPartId: 'base', toPartId: 'arm',
        fromAnchor: { x: 0.15, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
        yieldForceN: 1000, ultimateForceN: 2000,
        yieldTorqueNm: damageEnabled ? 25 : 1000, ultimateTorqueNm: damageEnabled ? 40 : 2000,
        strengthImpulseNs: 1000 };
      world.spawn({ id: 'machine', blueprint: blueprint([
        part('base', 0, 2, { x: 0.18, y: 0.18, z: 0.18 }, 100),
        part('arm', 0.65, 2, { x: 0.5, y: 0.07, z: 0.1 }, 2),
      ], connection, material(), [{ id: 'motor', connectionId: 'hinge', maxOutput: 20 }]) }, {
        energy: { capacityJ: 100000, maxPowerWatts: 1000, efficiency: 1 }, control: () => [{ actuatorId: 'motor', value: 1 }],
      });
      const body = world.getPhysicsBody('machine');
      let peakForceN = 0;
      let peakTorqueNm = 0;
      let peakJointPosition = 0;
      for (let tick = 0; tick < 25; tick += 1) {
        world.stepOnce();
        peakForceN = Math.max(peakForceN, physics.readConnectionLoad(body, 'hinge').forceN);
        peakTorqueNm = Math.max(peakTorqueNm, physics.readConnectionLoad(body, 'hinge').torqueNm);
        peakJointPosition = Math.max(peakJointPosition, physics.readJointPosition(body, 'hinge'));
      }
      return { peakForceN, peakTorqueNm, peakJointPosition,
        damage: world.getDamageRuntime('machine').state.connections.hinge.damage,
        connected: world.getDamageRuntime('machine').state.connections.hinge.connected };
    }
    const free = await run(false);
    const blocked = await run(true);
    const freeAtStrength = await run(false, true);
    const damaged = await run(true, true);
    console.info('Phase9 B', { free, blocked, freeAtStrength, damaged });
    expect(free.peakJointPosition).toBeGreaterThan(blocked.peakJointPosition);
    expect(blocked.peakForceN).toBeGreaterThan(free.peakForceN * 2);
    expect(blocked.peakTorqueNm).toBeGreaterThan(free.peakTorqueNm * 2);
    expect(freeAtStrength.connected).toBe(true);
    expect(damaged.connected).toBe(false);
    expect(damaged.damage.deformation).toBeGreaterThan(0);
  });

  it('Experiment C: sustained opposite forces overload a connection without contact', async () => {
    async function run(forceN: number) {
      const physics = await RapierPhysicsAdapter.create();
      const world = new WorldRuntime(physics);
      const connection: Connection = { id: 'tie', kind: 'rigid', fromPartId: 'left', toPartId: 'right',
        fromAnchor: { x: 0.5, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 },
        yieldForceN: 8, ultimateForceN: 40, strengthImpulseNs: 1000 };
      world.spawn({ id: 'pull', blueprint: blueprint([
        part('left', -0.5, 3, { x: 0.12, y: 0.12, z: 0.12 }, 1),
        part('right', 0.5, 3, { x: 0.12, y: 0.12, z: 0.12 }, 1),
      ], connection, material()) });
      const body = world.getPhysicsBody('pull');
      let peakForceN = 0;
      let firstSeparationTick = -1;
      for (let tick = 0; tick < 65; tick += 1) {
        physics.applyForce(body.partHandles.get('left')!, { x: -forceN, y: 0, z: 0 });
        physics.applyForce(body.partHandles.get('right')!, { x: forceN, y: 0, z: 0 });
        world.stepOnce();
        peakForceN = Math.max(peakForceN, physics.readConnectionLoad(body, 'tie').forceN);
        if (firstSeparationTick < 0 && !world.getDamageRuntime('pull').state.connections.tie.connected) firstSeparationTick = tick;
      }
      return { peakForceN, firstSeparationTick,
        damage: world.getDamageRuntime('pull').state.connections.tie.damage,
        connected: world.getDamageRuntime('pull').state.connections.tie.connected,
        components: world.listComponents().length };
    }
    const low = await run(4);
    const high = await run(18);
    console.info('Phase9 C', { low, high });
    expect(low.peakForceN).toBeGreaterThan(1);
    expect(low.connected).toBe(true);
    expect(low.damage.deformation).toBe(0);
    expect(high.peakForceN).toBeGreaterThan(low.peakForceN * 2);
    expect(high.connected).toBe(false);
    expect(high.components).toBe(2);
    expect(high.firstSeparationTick).toBeGreaterThan(0);
  });

  it('a physical force couple transmits torque and can separate a rigid connection', async () => {
    async function run(forceN: number, damageEnabled: boolean) {
      const physics = await RapierPhysicsAdapter.create();
      const world = new WorldRuntime(physics);
      const connection: Connection = { id: 'twist', kind: 'rigid', fromPartId: 'left', toPartId: 'right',
        fromAnchor: { x: 0.5, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 },
        yieldTorqueNm: damageEnabled ? 0.1 : 1000, ultimateTorqueNm: damageEnabled ? 0.3 : 2000,
        strengthImpulseNs: 1000 };
      world.spawn({ id: 'couple', blueprint: blueprint([
        part('left', -0.5, 3, { x: 0.12, y: 0.12, z: 0.12 }, 1),
        part('right', 0.5, 3, { x: 0.12, y: 0.12, z: 0.12 }, 1),
      ], connection, material()) });
      const body = world.getPhysicsBody('couple');
      let peakTorqueNm = 0;
      for (let tick = 0; tick < 30; tick += 1) {
        physics.applyForce(body.partHandles.get('left')!, { x: 0, y: forceN, z: 0 });
        physics.applyForce(body.partHandles.get('right')!, { x: 0, y: -forceN, z: 0 });
        world.stepOnce();
        peakTorqueNm = Math.max(peakTorqueNm, physics.readConnectionLoad(body, 'twist').torqueNm);
      }
      return { peakTorqueNm, damage: world.getDamageRuntime('couple').state.connections.twist.damage,
        connected: world.getDamageRuntime('couple').state.connections.twist.connected };
    }
    const low = await run(2, false);
    const high = await run(20, false);
    const damaged = await run(20, true);
    console.info('Phase9 torque', { low, high, damaged });
    expect(high.peakTorqueNm).toBeGreaterThan(low.peakTorqueNm * 2);
    expect(damaged.connected).toBe(false);
  });
});
