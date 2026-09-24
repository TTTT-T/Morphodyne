import { describe, expect, it } from 'vitest';
import type { Blueprint, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import { WorldRuntime } from '../simulation/WorldRuntime';

const identity = { x: 0, y: 0, z: 0, w: 1 } as const;
const material: Material = { id: 'steel', density: 1000, friction: 0.8, restitution: 0,
  yieldImpulseNs: 500, toughnessImpulseNs: 1000 };
const energy = { capacityJ: 1000, maxPowerWatts: 1000, efficiency: 1 } as const;

function box(id: string, position: Vector3, halfExtents: Vector3, mass: number): Part {
  return { id, materialId: material.id, mass, geometry: { kind: 'box', halfExtents },
    pose: { position, rotation: identity } };
}

function lever(attachmentX: number, withActuator = true, ultimateTorqueNm = 2000): Blueprint {
  return { id: 'lever', materials: [material],
    parts: [box('base', { x: 0, y: 2, z: 0 }, { x: 0.18, y: 0.55, z: 0.18 }, 100),
      box('arm', { x: 0.65, y: 2, z: 0 }, { x: 0.5, y: 0.07, z: 0.1 }, 2)],
    connections: [{ id: 'hinge', kind: 'revolute', fromPartId: 'base', toPartId: 'arm',
      fromAnchor: { x: 0.15, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 },
      axis: { x: 0, y: 0, z: 1 }, strengthImpulseNs: 1000,
      yieldForceN: 1000, ultimateForceN: 2000,
      yieldTorqueNm: ultimateTorqueNm * 0.6, ultimateTorqueNm }],
    actuators: withActuator ? [{ id: 'pull', kind: 'tension', fromPartId: 'base', toPartId: 'arm',
      fromAttachment: { x: 0, y: 0.5, z: 0 }, toAttachment: { x: attachmentX, y: 0, z: 0 },
      maxOutput: 100 }] : [],
  };
}

async function liftingTrial(attachmentX: number, actuator: 'present' | 'absent' | 'constructed' = 'present',
  ultimateTorqueNm = 2000) {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({ halfExtents: { x: 0.3, y: 0.1, z: 0.3 },
    position: { x: 0, y: 1.35, z: 0 }, dynamic: false });
  const world = new WorldRuntime(physics);
  const construction = new ConstructionRuntime(world);
  construction.spawn({ id: 'machine', blueprint: lever(attachmentX, actuator === 'present', ultimateTorqueNm) }, {
    energy, control: () => [{ actuatorId: 'pull', value: 1 }],
  });
  const originalIdentity = world.inspectEntity('machine')!.id;
  if (actuator === 'constructed') construction.addActuator('machine', lever(attachmentX).actuators![0]!);
  construction.spawn({ id: 'payload', blueprint: { id: 'payload', materials: [material],
    parts: [box('load', { x: 1.08, y: 2.21, z: 0 }, { x: 0.12, y: 0.12, z: 0.09 }, 1)],
    connections: [] } });
  const machine = world.getPhysicsBody('machine');
  const initialY = world.readPartPose('payload', 'load').position.y;
  let maxY = initialY;
  let peakLoadN = 0;
  let peakLoadNm = 0;
  let contactTicks = 0;
  for (let tick = 0; tick < 50; tick += 1) {
    world.stepOnce();
    maxY = Math.max(maxY, world.readPartPose('payload', 'load').position.y);
    const load = physics.readConnectionLoad(machine, 'hinge');
    peakLoadN = Math.max(peakLoadN, load.forceN);
    peakLoadNm = Math.max(peakLoadNm, load.torqueNm);
    if (physics.readPartContacts(world.getPhysicsBody('payload'), 'load').length > 0) contactTicks += 1;
  }
  return { maxLiftM: maxY - initialY, finalY: world.readPartPose('payload', 'load').position.y,
    energyConsumedJ: world.inspectEnergy('machine')!.consumedEnergyJ, peakLoadN, peakLoadNm,
    contactTicks, connected: world.getDamageRuntime('machine').state.connections.hinge.connected,
    identityPreserved: world.inspectEntity('machine')!.id === originalIdentity };
}

async function damageTrial(repair: boolean) {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({ halfExtents: { x: 0.3, y: 0.1, z: 0.3 },
    position: { x: 0, y: 1.35, z: 0 }, dynamic: false });
  const world = new WorldRuntime(physics);
  const construction = new ConstructionRuntime(world);
  let active = false;
  construction.spawn({ id: 'machine', blueprint: lever(0.3, true, 30) }, {
    energy, control: () => [{ actuatorId: 'pull', value: active ? 1 : 0 }],
  });
  const machine = world.getPhysicsBody('machine');
  physics.applyTorqueImpulse(machine.partHandles.get('arm')!, { x: 0, y: 0, z: -0.8 });
  world.stepOnce();
  const damaged = !world.getDamageRuntime('machine').state.connections.hinge.connected;
  const damage = world.getDamageRuntime('machine').state.connections.hinge.damage;
  if (repair) construction.repair('machine', 'hinge');
  construction.spawn({ id: 'payload', blueprint: { id: 'payload', materials: [material],
    parts: [box('load', { x: 1.08, y: 2.21, z: 0 }, { x: 0.12, y: 0.12, z: 0.09 }, 1)],
    connections: [] } });
  active = true;
  const initialY = world.readPartPose('payload', 'load').position.y;
  let maxY = initialY;
  let peakLoadN = 0;
  let peakLoadNm = 0;
  for (let tick = 0; tick < 50; tick += 1) {
    world.stepOnce();
    maxY = Math.max(maxY, world.readPartPose('payload', 'load').position.y);
    const load = physics.readConnectionLoad(world.getPhysicsBody('machine'), 'hinge');
    peakLoadN = Math.max(peakLoadN, load.forceN);
    peakLoadNm = Math.max(peakLoadNm, load.torqueNm);
  }
  return { damaged, repaired: world.getDamageRuntime('machine').state.connections.hinge.connected,
    damage, maxLiftM: maxY - initialY,
    energyConsumedJ: world.inspectEnergy('machine')!.consumedEnergyJ, peakLoadN, peakLoadNm,
    entityId: world.inspectEntity('machine')!.id };
}

describe('Phase 12 observed physical outcomes', () => {
  it('keeps task outcomes out of structural and world Entity declarations', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    const construction = new ConstructionRuntime(world);
    construction.spawn({ id: 'machine', blueprint: lever(0.3) }, { energy });
    const declarations = JSON.stringify({ blueprint: construction.inspect('machine').blueprint,
      entity: world.inspectEntity('machine') });
    expect(declarations).not.toMatch(/"(?:capabilities|canLift|canGrip|canMove|canWalk|canPush|canCarry|gripStrength|liftCapacity|movementSpeed|attackPower|machineType|animalType)"\s*:/);
  });

  it('A: changing only an attachment point changes lifting of a separate passive payload', async () => {
    const short = await liftingTrial(-0.3);
    const long = await liftingTrial(0.3);
    console.info('Phase12 A', { short, long });
    expect(short.connected && long.connected).toBe(true);
    expect(long.contactTicks).toBeGreaterThan(0);
    expect(long.maxLiftM).toBeGreaterThan(short.maxLiftM + 0.1);
  });

  it('C: Construction adds an actuator to the same Entity and changes the measured lift', async () => {
    const withoutActuator = await liftingTrial(0.3, 'absent');
    const constructed = await liftingTrial(0.3, 'constructed');
    console.info('Phase12 C', { withoutActuator, constructed });
    expect(constructed.identityPreserved).toBe(true);
    expect(constructed.maxLiftM).toBeGreaterThan(withoutActuator.maxLiftM + 0.1);
  });

  it('D: physical overload separates the hinge; construction repair restores lift', async () => {
    const intact = await liftingTrial(0.3, 'present', 30);
    const damaged = await damageTrial(false);
    const repaired = await damageTrial(true);
    console.info('Phase12 D', { intact, damaged, repaired });
    expect(damaged.damaged && repaired.damaged).toBe(true);
    expect(damaged.damage.state).toBe('separated');
    expect(damaged.damage.accumulatedOverloadSeconds).toBeGreaterThan(0);
    expect(damaged.maxLiftM).toBeLessThan(intact.maxLiftM - 0.25);
    expect(repaired.repaired).toBe(true);
    expect(repaired.entityId).toBe(damaged.entityId);
    expect(repaired.maxLiftM).toBeGreaterThan(damaged.maxLiftM + 0.25);
  });
});
