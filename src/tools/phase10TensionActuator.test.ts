import { describe, expect, it } from 'vitest';
import type { TensionActuator } from '../core/actuation';
import type { Blueprint, Connection, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';

const rotation = { x: 0, y: 0, z: 0, w: 1 } as const;

interface TrialOptions {
  readonly armAttachmentX?: number;
  readonly baseAttachmentX?: number;
  readonly baseAttachmentY?: number;
  readonly blocked?: boolean;
  readonly signal?: number;
  readonly maxOutput?: number;
  readonly responseTimeSeconds?: number;
  readonly availablePowerWatts?: number;
  readonly yieldTorqueNm?: number;
  readonly ultimateTorqueNm?: number;
  readonly ticks?: number;
}

async function trial(options: TrialOptions = {}) {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({ halfExtents: { x: 0.3, y: 0.1, z: 0.3 },
    position: { x: 0, y: 1.35, z: 0 }, dynamic: false });
  if (options.blocked) physics.createBox({ halfExtents: { x: 0.12, y: 0.05, z: 0.25 },
    position: { x: 1.05, y: 2.32, z: 0 }, dynamic: false });
  const material: Material = { id: 'material', density: 1000, friction: 0.8, restitution: 0,
    yieldImpulseNs: 500, toughnessImpulseNs: 1000 };
  const part = (id: string, x: number, halfExtents: Vector3, mass: number): Part => ({
    id, materialId: material.id, geometry: { kind: 'box', halfExtents }, mass,
    pose: { position: { x, y: 2, z: 0 }, rotation },
  });
  const connection: Connection = { id: 'hinge', kind: 'revolute', fromPartId: 'base', toPartId: 'arm',
    fromAnchor: { x: 0.15, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 },
    axis: { x: 0, y: 0, z: 1 }, strengthImpulseNs: 1000,
    yieldForceN: 1000, ultimateForceN: 2000,
    yieldTorqueNm: options.yieldTorqueNm ?? 1000,
    ultimateTorqueNm: options.ultimateTorqueNm ?? 2000 };
  const actuator: TensionActuator = { id: 'pull', kind: 'tension', fromPartId: 'base', toPartId: 'arm',
    fromAttachment: { x: options.baseAttachmentX ?? 0, y: options.baseAttachmentY ?? 0.5, z: 0 },
    toAttachment: { x: options.armAttachmentX ?? 0.3, y: 0, z: 0 },
    maxOutput: options.maxOutput ?? 40,
    ...(options.responseTimeSeconds ? { responseTimeSeconds: options.responseTimeSeconds } : {}) };
  const blueprint: Blueprint = { id: 'tension-machine', materials: [material],
    parts: [part('base', 0, { x: 0.18, y: 0.55, z: 0.18 }, 100),
      part('arm', 0.65, { x: 0.5, y: 0.07, z: 0.1 }, 2)],
    connections: [connection], actuators: [actuator] };
  const world = new WorldRuntime(physics);
  world.spawn({ id: 'machine', blueprint }, { energy: { availablePowerWatts: options.availablePowerWatts ?? 1000 },
    control: () => [{ actuatorId: 'pull', value: options.signal ?? 1 }] });
  const body = world.getPhysicsBody('machine');
  let peakForceN = 0;
  let peakTorqueNm = 0;
  let peakJointPosition = 0;
  let firstSeparationTick = -1;
  for (let tick = 0; tick < (options.ticks ?? 25); tick += 1) {
    world.stepOnce();
    const load = physics.readConnectionLoad(body, 'hinge');
    peakForceN = Math.max(peakForceN, load.forceN);
    peakTorqueNm = Math.max(peakTorqueNm, load.torqueNm);
    peakJointPosition = Math.max(peakJointPosition, physics.readJointPosition(body, 'hinge'));
    if (firstSeparationTick < 0 && !world.getDamageRuntime('machine').state.connections.hinge.connected) {
      firstSeparationTick = tick;
    }
  }
  return { peakForceN, peakTorqueNm, peakJointPosition, firstSeparationTick,
    finalJointPosition: physics.readJointPosition(body, 'hinge'),
    connected: world.getDamageRuntime('machine').state.connections.hinge.connected,
    deformation: world.getDamageRuntime('machine').state.connections.hinge.damage.deformation };
}

describe('Phase 10 tension through WorldRuntime', () => {
  it('pulls separate structural components without creating a Connection', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    const material: Material = { id: 'material', density: 1000, friction: 0.5, restitution: 0 };
    const parts: Part[] = [-1, 1].map((x, index) => ({
      id: `part-${index}`, materialId: material.id, mass: 1,
      geometry: { kind: 'box', halfExtents: { x: 0.1, y: 0.1, z: 0.1 } },
      pose: { position: { x, y: 3, z: 0 }, rotation },
    }));
    const blueprint: Blueprint = { id: 'separate-pull', materials: [material], parts, connections: [],
      actuators: [{ id: 'pull', kind: 'tension', fromPartId: 'part-0', toPartId: 'part-1',
        fromAttachment: { x: 0, y: 0, z: 0 }, toAttachment: { x: 0, y: 0, z: 0 }, maxOutput: 20 }] };
    world.spawn({ id: 'machine', blueprint }, { energy: { availablePowerWatts: 1000 },
      control: () => [{ actuatorId: 'pull', value: 1 }] });
    expect(world.listComponents()).toHaveLength(2);
    expect(world.inspectEntity('machine')?.actuatorIds).toEqual(['pull']);
    for (let tick = 0; tick < 20; tick += 1) world.stepOnce();
    const body = world.getPhysicsBody('machine');
    const left = body.readPartPose('part-0').position.x;
    const right = body.readPartPose('part-1').position.x;
    expect(right - left).toBeLessThan(1.5);
    expect(left + right).toBeCloseTo(0, 4);
  });

  it('Experiment A: a longer attachment lever rotates farther at the same pull', async () => {
    const noPull = await trial({ signal: 0 });
    const short = await trial({ armAttachmentX: -0.3 });
    const long = await trial({ armAttachmentX: 0.3 });
    console.info('Phase10 A', { short, long });
    const shortResponse = short.finalJointPosition - noPull.finalJointPosition;
    const longResponse = long.finalJointPosition - noPull.finalJointPosition;
    expect(shortResponse).toBeGreaterThan(0);
    expect(longResponse).toBeGreaterThan(shortResponse * 2.5);
  });

  it('Experiment B: attachment direction changes movement with identical Parts and output', async () => {
    const noPull = await trial({ signal: 0 });
    const aligned = await trial({ baseAttachmentY: 0 });
    const offset = await trial({ baseAttachmentY: 0.5 });
    console.info('Phase10 B', { aligned, offset });
    expect(Math.abs(aligned.finalJointPosition - noPull.finalJointPosition)).toBeLessThan(0.1);
    expect(offset.finalJointPosition - noPull.finalJointPosition).toBeGreaterThan(1.5);
  });

  it('Experiment C: a physical obstruction produces load and Phase 9 structural damage', async () => {
    const free = await trial();
    const blocked = await trial({ blocked: true });
    const freeAtStrength = await trial({ yieldTorqueNm: 8, ultimateTorqueNm: 20 });
    const blockedAtStrength = await trial({ blocked: true, yieldTorqueNm: 8, ultimateTorqueNm: 20 });
    console.info('Phase10 C', { free, blocked, freeAtStrength, blockedAtStrength });
    expect(blocked.peakTorqueNm).toBeGreaterThan(free.peakTorqueNm * 3);
    expect(blocked.peakJointPosition).toBeLessThan(free.peakJointPosition);
    expect(freeAtStrength.connected).toBe(true);
    expect(blockedAtStrength.connected).toBe(false);
    expect(blockedAtStrength.deformation).toBeGreaterThan(0);
  });

  it('Experiment D: zero and negative signals never push, and near-zero span stays finite', async () => {
    const zero = await trial({ signal: 0 });
    const negative = await trial({ signal: -1 });
    const positive = await trial({ signal: 1 });
    const unpowered = await trial({ availablePowerWatts: 0 });
    const coincident = await trial({ baseAttachmentX: 0.15, baseAttachmentY: 0,
      armAttachmentX: -0.5, ticks: 1 });
    const coincidentNoPull = await trial({ baseAttachmentX: 0.15, baseAttachmentY: 0,
      armAttachmentX: -0.5, signal: 0, ticks: 1 });
    console.info('Phase10 D', { zero, negative, positive });
    expect(negative).toEqual(zero);
    expect(unpowered).toEqual(zero);
    expect(coincident).toEqual(coincidentNoPull);
    expect(Object.values(coincident).filter((value): value is number => typeof value === 'number')
      .every(Number.isFinite)).toBe(true);
    expect(positive.peakJointPosition).toBeGreaterThan(zero.peakJointPosition);
  });

  it('uses the shared response time to ramp active tension', async () => {
    const immediate = await trial({ ticks: 4 });
    const delayed = await trial({ ticks: 4, responseTimeSeconds: 0.5 });
    const noPull = await trial({ ticks: 4, signal: 0 });
    expect(immediate.finalJointPosition - noPull.finalJointPosition)
      .toBeGreaterThan((delayed.finalJointPosition - noPull.finalJointPosition) * 2);
  });
});
