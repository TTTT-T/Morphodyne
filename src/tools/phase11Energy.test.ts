import { describe, expect, it } from 'vitest';
import type { Blueprint, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';

const rotation = { x: 0, y: 0, z: 0, w: 1 } as const;
const material: Material = { id: 'material', density: 1000, friction: 0.5, restitution: 0 };
const origin: Vector3 = { x: 0, y: 0, z: 0 };

function part(id: string, x: number): Part {
  return { id, materialId: material.id, mass: 1,
    geometry: { kind: 'box', halfExtents: { x: 0.1, y: 0.1, z: 0.1 } },
    pose: { position: { x, y: 10, z: 0 }, rotation } };
}

function machine(reverseActuators = false): Blueprint {
  const actuators: NonNullable<Blueprint['actuators']> = [
    { id: 'joint', connectionId: 'slide', maxOutput: 20 },
    { id: 'tension', kind: 'tension', fromPartId: 'left', toPartId: 'right',
      fromAttachment: origin, toAttachment: origin, maxOutput: 20 },
  ];
  return { id: 'two-output-machine', materials: [material],
    parts: [part('rail', 0), part('slider', 0.4), part('left', 3), part('right', 5)],
    connections: [{ id: 'slide', kind: 'prismatic', fromPartId: 'rail', toPartId: 'slider',
      fromAnchor: { x: 0.2, y: 0, z: 0 }, toAnchor: { x: -0.2, y: 0, z: 0 },
      axis: { x: 1, y: 0, z: 0 }, strengthImpulseNs: 1000 }],
    actuators: reverseActuators ? [...actuators].reverse() : actuators };
}

interface TrialOptions {
  readonly capacityJ: number;
  readonly maxPowerWatts: number;
  readonly efficiency?: number;
  readonly jointSignal?: number;
  readonly tensionSignal?: number;
  readonly reverseActuators?: boolean;
}

async function setup(options: TrialOptions) {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics);
  world.spawn({ id: 'machine', blueprint: machine(options.reverseActuators) }, {
    energy: { capacityJ: options.capacityJ, maxPowerWatts: options.maxPowerWatts,
      efficiency: options.efficiency ?? 1 },
    control: () => [{ actuatorId: 'joint', value: options.jointSignal ?? 0 },
      { actuatorId: 'tension', value: options.tensionSignal ?? 0 }],
  });
  const body = world.getPhysicsBody('machine');
  const read = () => {
    const left = body.readPartPose('left').position.x;
    const right = body.readPartPose('right').position.x;
    const leftSpeed = physics.readPointVelocity(body.partHandles.get('left')!, origin).x;
    const rightSpeed = physics.readPointVelocity(body.partHandles.get('right')!, origin).x;
    return { span: right - left, relativeSpeed: rightSpeed - leftSpeed,
      jointPosition: physics.readJointPosition(body, 'slide'),
      jointVelocity: physics.readJointVelocity(body, 'slide'),
      energy: world.inspectEnergy('machine')! };
  };
  return { world, physics, body, read };
}

describe('Phase 11 finite energy through WorldRuntime and Rapier', () => {
  it('A: actual work exhausts a finite store and stops adding relative kinetic energy', async () => {
    const { world, read } = await setup({ capacityJ: 0.2, maxPowerWatts: 100, tensionSignal: 1 });
    let exhaustionTick = -1;
    let speedAtExhaustion = 0;
    for (let tick = 1; tick <= 12; tick += 1) {
      world.stepOnce();
      const state = read();
      if (exhaustionTick < 0 && state.energy.remainingEnergyJ === 0) {
        exhaustionTick = tick;
        speedAtExhaustion = Math.abs(state.relativeSpeed);
      }
    }
    const final = read();
    console.info('Phase11 A', { exhaustionTick, speedAtExhaustion, final });
    expect(exhaustionTick).toBeGreaterThan(1);
    expect(final.energy.remainingEnergyJ).toBe(0);
    expect(final.energy.consumedEnergyJ).toBeCloseTo(0.2);
    expect(final.energy.stepMechanicalPowerWatts).toBe(0);
    expect(Math.abs(final.relativeSpeed)).toBeLessThanOrEqual(speedAtExhaustion + 0.05);
  });

  it('B: watts limit physical motion with the same stored joules', async () => {
    const low = await setup({ capacityJ: 100, maxPowerWatts: 1, tensionSignal: 1 });
    const high = await setup({ capacityJ: 100, maxPowerWatts: 100, tensionSignal: 1 });
    for (let tick = 0; tick < 15; tick += 1) { low.world.stepOnce(); high.world.stepOnce(); }
    const lowState = low.read();
    const highState = high.read();
    console.info('Phase11 B', { low: lowState, high: highState });
    expect(lowState.energy.stepMechanicalPowerWatts).toBeLessThanOrEqual(1 + 1e-9);
    expect(highState.energy.stepMechanicalPowerWatts).toBeGreaterThan(lowState.energy.stepMechanicalPowerWatts);
    expect(highState.span).toBeLessThan(lowState.span - 0.1);
  });

  it('C: Joint and Tension share one proportional mechanical power budget', async () => {
    const joint = await setup({ capacityJ: 100, maxPowerWatts: 10, jointSignal: 1 });
    const tension = await setup({ capacityJ: 100, maxPowerWatts: 10, tensionSignal: 1 });
    const both = await setup({ capacityJ: 100, maxPowerWatts: 10, jointSignal: 1, tensionSignal: 1 });
    const reversed = await setup({ capacityJ: 100, maxPowerWatts: 10, jointSignal: 1,
      tensionSignal: 1, reverseActuators: true });
    for (let tick = 0; tick < 6; tick += 1) {
      joint.world.stepOnce(); tension.world.stepOnce(); both.world.stepOnce(); reversed.world.stepOnce();
    }
    const j = joint.read();
    const t = tension.read();
    const b = both.read();
    console.info('Phase11 C', { joint: j, tension: t, both: b });
    expect(j.energy.stepMechanicalPowerWatts).toBeGreaterThan(0);
    expect(t.energy.stepMechanicalPowerWatts).toBeGreaterThan(0);
    expect(b.energy.stepMechanicalPowerWatts).toBeLessThanOrEqual(10 + 1e-9);
    expect(b.jointPosition).toBeLessThan(j.jointPosition);
    expect(b.span).toBeGreaterThan(t.span);
    expect(reversed.read().jointPosition).toBeCloseTo(b.jointPosition, 6);
    expect(reversed.read().span).toBeCloseTo(b.span, 6);
  });

  it('D: efficiency changes draw per work and eventual endurance, not initial output', async () => {
    const efficient = await setup({ capacityJ: 1, maxPowerWatts: 100, efficiency: 1, tensionSignal: 1 });
    const wasteful = await setup({ capacityJ: 1, maxPowerWatts: 100, efficiency: 0.5, tensionSignal: 1 });
    for (let tick = 0; tick < 2; tick += 1) { efficient.world.stepOnce(); wasteful.world.stepOnce(); }
    const earlyEfficient = efficient.read();
    const earlyWasteful = wasteful.read();
    expect(earlyEfficient.span).toBeCloseTo(earlyWasteful.span, 6);
    expect(earlyWasteful.energy.consumedEnergyJ).toBeCloseTo(earlyEfficient.energy.consumedEnergyJ * 2, 6);
    let efficientExhaustionTick = -1;
    let wastefulExhaustionTick = -1;
    for (let tick = 3; tick <= 15; tick += 1) {
      efficient.world.stepOnce(); wasteful.world.stepOnce();
      if (efficientExhaustionTick < 0 && efficient.read().energy.remainingEnergyJ === 0) efficientExhaustionTick = tick;
      if (wastefulExhaustionTick < 0 && wasteful.read().energy.remainingEnergyJ === 0) wastefulExhaustionTick = tick;
    }
    const lateEfficient = efficient.read();
    const lateWasteful = wasteful.read();
    console.info('Phase11 D', { earlyEfficient, earlyWasteful, efficientExhaustionTick,
      wastefulExhaustionTick, lateEfficient, lateWasteful });
    expect(lateEfficient.energy.remainingEnergyJ).toBe(0);
    expect(lateWasteful.energy.remainingEnergyJ).toBe(0);
    expect(wastefulExhaustionTick).toBeLessThan(efficientExhaustionTick);
    expect(lateEfficient.span).toBeLessThan(lateWasteful.span);
  });

  it('E: external back-driving does not create energy or negative consumption', async () => {
    const { world, physics, body, read } = await setup({ capacityJ: 10, maxPowerWatts: 100, jointSignal: 1 });
    world.applyImpact('machine', 'slider', { x: -3, y: 0, z: 0 });
    world.stepOnce();
    const before = read();
    expect(physics.readJointVelocity(body, 'slide')).toBeLessThan(0);
    world.stepOnce();
    const after = read();
    console.info('Phase11 E', { before, after });
    expect(after.energy.remainingEnergyJ).toBe(before.energy.remainingEnergyJ);
    expect(after.energy.consumedEnergyJ).toBe(before.energy.consumedEnergyJ);
    expect(after.energy.stepMechanicalPowerWatts).toBe(0);
    expect(after.energy.stepEnergyDrawJ).toBe(0);
  });

  it('preserves the finite store across Construction-style structure replacement', async () => {
    const { world } = await setup({ capacityJ: 1, maxPowerWatts: 100, tensionSignal: 1 });
    world.stepOnce();
    world.stepOnce();
    const before = world.inspectEnergy('machine')!;
    expect(before.consumedEnergyJ).toBeGreaterThan(0);
    world.replaceStructure('machine', machine());
    expect(world.inspectEnergy('machine')).toEqual(before);
    world.stepOnce();
    expect(world.inspectEnergy('machine')!.remainingEnergyJ).toBeLessThan(before.remainingEnergyJ);
  });
});
