import { describe, expect, it } from 'vitest';
import type { ControlSignal } from '../core/actuation';
import type { Quaternion, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createArenaSession } from './ArenaSession';
import { LeopardAgentRuntime } from './LeopardAgent';
import { createLeopardBlueprint } from './LeopardBlueprint';
import { LeopardTractionInstrument } from './LeopardTraction';
import { createPassiveObjectBlueprint } from './worldFixtures';

const vector = (x: number, y: number, z: number): Vector3 => ({ x, y, z });
const PAW_IDS = ['leopard-front-left-paw', 'leopard-front-right-paw',
  'leopard-hind-left-paw', 'leopard-hind-right-paw'];
const RUN_TICKS = 600;

const baseline: { slipRatio: number; torsoPath: number; displacement: number } = {
  slipRatio: Infinity, torsoPath: 0, displacement: 0,
};

function upFromQuaternion(rotation: Quaternion): number {
  return 1 - 2 * (rotation.x ** 2 + rotation.z ** 2);
}

function headingFromQuaternion(rotation: Quaternion): number {
  return Math.atan2(2 * (rotation.x * rotation.z - rotation.w * rotation.y),
    1 - 2 * (rotation.y ** 2 + rotation.z ** 2));
}

function logResult(name: string, fields: Record<string, number | string>): void {
  const values = Object.entries(fields).map(([key, value]) =>
    key + '=' + (typeof value === 'number' ? value.toFixed(3) : value));
  console.info('[Animal Arena v0.4] ' + name + ': ' + values.join(' '));
}

function leopardControl(world: WorldRuntime, entityId: string, agent: LeopardAgentRuntime) {
  return (seconds: number, _tick: number): readonly ControlSignal[] => agent.control(
    world.readSensorRuntime(entityId)?.readAgentView() ?? { tick: -1, perceptions: [] }, seconds,
  );
}

async function createSoloLeopard(options: {
  target?: { readonly x: number; readonly z: number };
  friction?: number;
  gait?: 'traction' | 'phase-sine';
} = {}) {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics, {
    surfaces: [{ id: 'floor', position: vector(0, -0.15, 0),
      halfExtents: vector(12, 0.15, 12), friction: options.friction ?? 1.4 }],
  });
  const agent = new LeopardAgentRuntime(options.gait ?? 'traction');
  world.spawn({ id: 'solo', blueprint: createLeopardBlueprint() }, {
    energy: { capacityJ: 12000, maxPowerWatts: 650, efficiency: 0.82 },
    agent: { control: leopardControl(world, 'solo', agent) },
  });
  if (options.target) {
    world.spawn({ id: 'anonymous-target', blueprint: createPassiveObjectBlueprint({
      halfExtents: vector(0.35, 0.5, 0.35), mass: 80,
    }) }, { origin: vector(options.target.x, 0, options.target.z) });
  }
  return { world, agent };
}

/** Runs one measured locomotion session and returns instrument plus posture extremes. */
async function runMeasuredSession(options: {
  target: { readonly x: number; readonly z: number };
  friction?: number;
  gait?: 'traction' | 'phase-sine';
  ticks?: number;
}) {
  const { world, agent } = await createSoloLeopard(options);
  const instrument = new LeopardTractionInstrument(PAW_IDS);
  const initial = world.readPartPose('solo', 'leopard-chest').position;
  let minChestY = Infinity;
  let minUpright = Infinity;
  let maxSpherical = 0;
  for (let tick = 0; tick < (options.ticks ?? RUN_TICKS); tick += 1) {
    world.stepOnce();
    instrument.record(world, 'solo', 1 / 60);
    const chest = world.readPartPose('solo', 'leopard-chest');
    minChestY = Math.min(minChestY, chest.position.y);
    minUpright = Math.min(minUpright, upFromQuaternion(chest.rotation));
    for (const connectionId of ['leopard-spine-joint', 'leopard-front-left-hip-joint',
      'leopard-front-right-hip-joint', 'leopard-hind-left-hip-joint', 'leopard-hind-right-hip-joint']) {
      const values = world.readSensorRuntime('solo')?.readAgentView().perceptions
        .find((perception) => perception.ownConnectionId === connectionId)?.values;
      if (values && values.length >= 6) {
        maxSpherical = Math.max(maxSpherical, Math.abs(values[0]), Math.abs(values[2]), Math.abs(values[4]));
      }
    }
  }
  const final = world.readPartPose('solo', 'leopard-chest').position;
  const displacement = Math.hypot(final.x - initial.x, final.z - initial.z);
  const forwardDisplacement = final.x - initial.x;
  const summary = instrument.summary();
  return { world, agent, summary, displacement, forwardDisplacement, minChestY, minUpright, maxSpherical };
}

describe('Animal Arena v0.4 traction experiments', () => {
  it('A: measures the v0.3 phase-sine gait baseline slip, stance, and stride', async () => {
    const run = await runMeasuredSession({ target: { x: 4.2, z: 0 }, gait: 'phase-sine' });
    baseline.slipRatio = run.summary.stanceSlipRatio;
    baseline.torsoPath = run.summary.torsoPathLength;
    baseline.displacement = run.displacement;
    for (const paw of run.summary.paws) {
      logResult('A baseline paw ' + paw.pawId, {
        dutyFactor: paw.dutyFactor, stanceEpisodes: paw.stanceEpisodes,
        meanStride: paw.meanStrideLength, meanStancePawSlip: paw.meanStancePawSlip,
        meanStanceTorsoTravel: paw.meanStanceTorsoTravel, meanStancePawSpeed: paw.meanStancePawSpeed,
      });
    }
    logResult('A baseline total', {
      stanceSlipRatio: run.summary.stanceSlipRatio, torsoPath: run.summary.torsoPathLength,
      sustainedSlipRatio: run.summary.sustainedStanceSlipRatio,
      displacement: run.displacement, torsoMeanSpeed: run.summary.torsoMeanSpeed,
    });
    expect(run.summary.stanceSlipRatio).toBeGreaterThan(0.5);
    expect(run.displacement).toBeGreaterThan(0.3);
  });

  it('B: walks straight with contact-gated stance/swing and far less stance slip', async () => {
    const run = await runMeasuredSession({ target: { x: 4.2, z: 0 } });
    for (const paw of run.summary.paws) {
      logResult('B traction paw ' + paw.pawId, {
        dutyFactor: paw.dutyFactor, stanceEpisodes: paw.stanceEpisodes,
        meanStride: paw.meanStrideLength, meanStancePawSlip: paw.meanStancePawSlip,
        meanStanceTorsoTravel: paw.meanStanceTorsoTravel, meanSwingClearance: paw.meanSwingClearance,
        meanStancePawSpeed: paw.meanStancePawSpeed,
      });
    }
    logResult('B traction total', {
      stanceSlipRatio: run.summary.stanceSlipRatio, torsoPath: run.summary.torsoPathLength,
      sustainedSlipRatio: run.summary.sustainedStanceSlipRatio,
      displacement: run.displacement, torsoMeanSpeed: run.summary.torsoMeanSpeed,
      minChestY: run.minChestY, minUpright: run.minUpright, maxSpherical: run.maxSpherical,
    });
    const gaitStates = run.agent.inspectGaitStates();
    expect(gaitStates.length).toBe(4);
    expect(run.forwardDisplacement).toBeGreaterThan(0.8);
    expect(run.minChestY).toBeGreaterThan(0.5);
    expect(run.minUpright).toBeGreaterThan(0.5);
    expect(run.maxSpherical).toBeLessThan(1.25);
    for (const paw of run.summary.paws) {
      expect(paw.stanceEpisodes).toBeGreaterThanOrEqual(3);
      expect(paw.dutyFactor).toBeGreaterThan(0.3);
      expect(paw.dutyFactor).toBeLessThan(0.95);
      expect(paw.meanSwingClearance).toBeGreaterThan(0.05);
    }
    expect(run.summary.stanceSlipRatio).toBeLessThan(baseline.slipRatio * 0.85);
  });

  it('C: shows traction follows friction instead of a fake walk', async () => {
    const low = await runMeasuredSession({ target: { x: 4.2, z: 0 }, friction: 0.35 });
    const normal = await runMeasuredSession({ target: { x: 4.2, z: 0 }, friction: 1.4 });
    const high = await runMeasuredSession({ target: { x: 4.2, z: 0 }, friction: 2.4 });
    logResult('C low friction', {
      stanceSlipRatio: low.summary.stanceSlipRatio, displacement: low.displacement,
      torsoMeanSpeed: low.summary.torsoMeanSpeed,
    });
    logResult('C normal friction', {
      stanceSlipRatio: normal.summary.stanceSlipRatio, displacement: normal.displacement,
      torsoMeanSpeed: normal.summary.torsoMeanSpeed,
    });
    logResult('C high friction', {
      stanceSlipRatio: high.summary.stanceSlipRatio, displacement: high.displacement,
      torsoMeanSpeed: high.summary.torsoMeanSpeed,
    });
    expect(low.displacement).toBeLessThan(normal.displacement);
    expect(low.summary.stanceSlipRatio).toBeGreaterThan(normal.summary.stanceSlipRatio);
  });

  it('D: turns left and right through asymmetric stance and stride', async () => {
    const asymmetry = new Map<string, number>();
    for (const [label, target] of [['left', { x: 2.5, z: -1.2 }], ['right', { x: 2.5, z: 1.2 }]] as const) {
      const run = await runMeasuredSession({ target });
      const leftPaws = run.summary.paws.filter((paw) => paw.pawId.includes('left'));
      const rightPaws = run.summary.paws.filter((paw) => paw.pawId.includes('right'));
      const leftStance = leftPaws.reduce((sum, paw) => sum + paw.contactTicks, 0);
      const rightStance = rightPaws.reduce((sum, paw) => sum + paw.contactTicks, 0);
      const leftStride = leftPaws.reduce((sum, paw) => sum + paw.meanStrideLength, 0) / leftPaws.length;
      const rightStride = rightPaws.reduce((sum, paw) => sum + paw.meanStrideLength, 0) / rightPaws.length;
      const heading = headingFromQuaternion(run.world.readPartPose('solo', 'leopard-chest').rotation);
      logResult('D ' + label + ' turn', {
        heading, leftStance, rightStance, leftStride, rightStride,
        stanceSlipRatio: run.summary.stanceSlipRatio, displacement: run.displacement,
      });
      const stanceDifference = Math.abs(leftStance - rightStance)
        / Math.max(1, leftStance + rightStance);
      const strideDifference = Math.abs(leftStride - rightStride)
        / Math.max(1e-6, Math.abs(leftStride) + Math.abs(rightStride));
      asymmetry.set(label, Math.max(stanceDifference, strideDifference));
      if (label === 'left') expect(heading).toBeLessThan(-0.05);
      else expect(heading).toBeGreaterThan(0.05);
    }
    // At least one direction must show a real lateral support difference.
    expect(Math.max(...asymmetry.values())).toBeGreaterThan(0.04);
  });

  it('F: two independent Agents approach with trustworthy gaits and real contacts', async () => {
    const session = await createArenaSession();
    const { world, agents } = session;
    const instrument = new LeopardTractionInstrument(PAW_IDS);
    const initialA = world.readPartPose('leopard-a', 'leopard-chest').position;
    const initialB = world.readPartPose('leopard-b', 'leopard-chest').position;
    const initialGap = Math.hypot(initialA.x - initialB.x, initialA.z - initialB.z);
    let minimumGap = Infinity;
    let opponentContactTicks = 0;
    let frontLimbContactTicks = 0;
    let headContactTicks = 0;
    let jawContactTicks = 0;
    for (let tick = 0; tick < RUN_TICKS; tick += 1) {
      world.stepOnce();
      instrument.record(world, 'leopard-a', 1 / 60);
      const a = world.readPartPose('leopard-a', 'leopard-chest').position;
      const b = world.readPartPose('leopard-b', 'leopard-chest').position;
      minimumGap = Math.min(minimumGap, Math.hypot(a.x - b.x, a.z - b.z));
      const touching = [...world.inspectEntity('leopard-a')!.partIds,
        ...world.inspectEntity('leopard-b')!.partIds].filter((partId) =>
        world.readPartContacts(partId.includes('jaw') ? 'leopard-b' : 'leopard-a', partId)
          .some((contact) => contact.otherEntityId === (partId.includes('jaw') ? 'leopard-a' : 'leopard-b')));
      if (touching.length > 0) opponentContactTicks += 1;
      if (touching.some((partId) => partId.includes('front'))) frontLimbContactTicks += 1;
      if (touching.includes('leopard-head')) headContactTicks += 1;
      if (touching.includes('leopard-jaw')) jawContactTicks += 1;
    }
    const summary = instrument.summary();
    const aApproach = agents.get('leopard-a')!.inspectDecisionHistory()
      .filter((decision) => decision.skill === 'approach').length;
    const bApproach = agents.get('leopard-b')!.inspectDecisionHistory()
      .filter((decision) => decision.skill === 'approach').length;
    const aInteract = agents.get('leopard-a')!.inspectDecisionHistory()
      .filter((decision) => decision.skill === 'interact').length;
    logResult('F dual-agent', {
      minimumGap, initialGap, opponentContactTicks, frontLimbContactTicks,
      headContactTicks, jawContactTicks, stanceSlipRatio: summary.stanceSlipRatio,
      aApproach, bApproach, aInteract,
    });
    expect(aApproach + bApproach).toBeGreaterThan(0);
    expect(aInteract).toBeGreaterThan(0);
    expect(minimumGap).toBeLessThan(initialGap - 0.5);
    expect(opponentContactTicks).toBeGreaterThan(5);
    expect(frontLimbContactTicks).toBeGreaterThan(0);
    expect(headContactTicks).toBeGreaterThan(5);
    expect(jawContactTicks).toBeGreaterThan(0);
  });
});
