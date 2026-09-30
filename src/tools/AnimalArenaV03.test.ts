import { describe, expect, it } from 'vitest';
import { createControlSignal, type ControlSignal } from '../core/actuation';
import type { Blueprint, Material, Part, Pose, Quaternion, Sensor, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createArenaSession } from './ArenaSession';
import { LeopardAgentRuntime } from './LeopardAgent';
import { createLeopardBlueprint } from './LeopardBlueprint';
import { createPassiveObjectBlueprint } from './worldFixtures';

const identity: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
const vector = (x: number, y: number, z: number): Vector3 => ({ x, y, z });
const pose = (x: number, y: number, z: number): Pose => ({ position: vector(x, y, z), rotation: identity });
const floor = {
  surfaces: [{ id: 'floor', position: vector(0, -0.15, 0),
    halfExtents: vector(12, 0.15, 12), friction: 1.4 }],
};
const energy = { capacityJ: 12000, maxPowerWatts: 650, efficiency: 0.82 };

function upFromQuaternion(rotation: Quaternion): number {
  return 1 - 2 * (rotation.x ** 2 + rotation.z ** 2);
}

function headingFromQuaternion(rotation: Quaternion): number {
  return Math.atan2(2 * (rotation.x * rotation.z - rotation.w * rotation.y),
    1 - 2 * (rotation.y ** 2 + rotation.z ** 2));
}

function jointValues(world: WorldRuntime, entityId: string, connectionId: string): readonly number[] | undefined {
  return world.readSensorRuntime(entityId)?.readAgentView().perceptions
    .find((perception) => perception.ownConnectionId === connectionId)?.values;
}

function sphericalAngleMagnitude(values: readonly number[] | undefined): number {
  if (!values || values.length < 6) return 0;
  return Math.max(Math.abs(values[0]), Math.abs(values[2]), Math.abs(values[4]));
}

function logResult(name: string, fields: Record<string, number | string>): void {
  const values = Object.entries(fields).map(([key, value]) => `${key}=${typeof value === 'number' ? value.toFixed(3) : value}`);
  console.info(`[Animal Arena v0.3] ${name}: ${values.join(' ')}`);
}

function leopardControl(world: WorldRuntime, entityId: string, agent: LeopardAgentRuntime) {
  return (seconds: number, _tick: number): readonly ControlSignal[] => agent.control(
    world.readSensorRuntime(entityId)?.readAgentView() ?? { tick: -1, perceptions: [] }, seconds,
  );
}

async function createSoloLeopard(target?: { readonly x: number; readonly z: number }) {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics, floor);
  const agent = new LeopardAgentRuntime();
  world.spawn({ id: 'solo', blueprint: createLeopardBlueprint() }, {
    energy,
    agent: { control: leopardControl(world, 'solo', agent) },
  });
  if (target) {
    world.spawn({ id: 'anonymous-target', blueprint: createPassiveObjectBlueprint({
      halfExtents: vector(0.35, 0.5, 0.35), mass: 80,
    }) }, { origin: vector(target.x, 0, target.z) });
  }
  return { world, agent };
}

function pawContact(world: WorldRuntime, entityId: string, partId: string): boolean {
  return world.readPartContacts(entityId, partId).some((contact) => contact.otherEntityId === undefined);
}

function range(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function rotateVector(q: Quaternion, v: Vector3): Vector3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return vector(v.x + q.w * tx + q.y * tz - q.z * ty,
    v.y + q.w * ty + q.z * tx - q.x * tz,
    v.z + q.w * tz + q.x * ty - q.y * tx);
}

/** Travel of the same paw material point that is touching the floor now. */
function groundedMaterialPointTravel(previous: Pose, current: Pose, contactPoint: Vector3): number {
  const relative = vector(contactPoint.x - current.position.x,
    contactPoint.y - current.position.y, contactPoint.z - current.position.z);
  const q = current.rotation;
  const local = rotateVector({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, relative);
  const previousOffset = rotateVector(previous.rotation, local);
  return Math.hypot(contactPoint.x - previous.position.x - previousOffset.x,
    contactPoint.z - previous.position.z - previousOffset.z);
}

function makeAngularLimitBody(): Blueprint {
  const material: Material = {
    id: 'generic-limit-material', density: 600, friction: 0.5, restitution: 0.05,
  };
  const root: Part = {
    id: 'limit-root', materialId: material.id,
    geometry: { kind: 'box', halfExtents: vector(0.45, 0.2, 0.2) }, pose: pose(0, 3, 0), mass: 5,
  };
  const link: Part = {
    id: 'limit-link', materialId: material.id,
    geometry: { kind: 'box', halfExtents: vector(0.45, 0.2, 0.2) }, pose: pose(0.9, 3, 0), mass: 1,
  };
  const limits = [
    { axis: vector(0, 0, 1), min: -0.2, max: 0.2, stiffnessNmPerRad: 300,
      dampingNmsPerRad: 25, maxTorqueNm: 90 },
    { axis: vector(1, 0, 0), min: -0.2, max: 0.2, stiffnessNmPerRad: 300,
      dampingNmsPerRad: 25, maxTorqueNm: 90 },
    { axis: vector(0, 1, 0), min: -0.2, max: 0.2, stiffnessNmPerRad: 300,
      dampingNmsPerRad: 25, maxTorqueNm: 90 },
  ] as const;
  const sensor: Sensor = {
    id: 'limit-proprioception', kind: 'proprioception', partId: root.id,
    localPose: pose(0, 0, 0), forward: vector(1, 0, 0), updatePeriodTicks: 1,
    noise: { standardDeviation: 0 }, latencyTicks: 0, resolution: 1000,
  };
  return {
    id: 'generic-spherical-limit-blueprint', materials: [material], parts: [root, link],
    connections: [{ id: 'limit-spherical', kind: 'spherical', fromPartId: root.id,
      toPartId: link.id, fromAnchor: vector(0.45, 0, 0), toAnchor: vector(-0.45, 0, 0),
      angularLimits: limits }],
    actuators: [{ id: 'limit-twist-actuator', connectionId: 'limit-spherical', maxOutput: 8,
      responseTimeSeconds: 0.04, axis: vector(0, 0, 1) }],
    sensors: [sensor],
  };
}

describe('Animal Arena v0.3 body-use experiments', () => {
  it('A: constrains a generic spherical joint and allows reverse drive away from the stop', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    const blueprint = makeAngularLimitBody();
    world.spawn({ id: 'limit-body', blueprint }, {
      energy: { capacityJ: 100000, maxPowerWatts: 100000, efficiency: 1 },
      control: (_seconds, tick) => [createControlSignal('limit-twist-actuator', tick < 240 ? 1 : -1)],
    });
    let positivePeak = 0;
    let reverseMinimum = 0;
    for (let tick = 0; tick < 480; tick += 1) {
      world.stepOnce();
      const values = jointValues(world, 'limit-body', 'limit-spherical');
      if (!values) continue;
      const angle = values[0];
      if (tick < 240) positivePeak = Math.max(positivePeak, angle);
      else reverseMinimum = Math.min(reverseMinimum, angle);
    }
    logResult('A spherical angular limit', { positivePeak, reverseMinimum });
    expect(positivePeak).toBeGreaterThan(0.12);
    expect(positivePeak).toBeLessThan(0.45);
    expect(reverseMinimum).toBeLessThan(-0.12);
  });

  it('B: holds a single Leopard body for 600 ticks with measured support, limits, and energy', async () => {
    const { world, agent } = await createSoloLeopard();
    const pawIds = ['front-left', 'front-right', 'hind-left', 'hind-right']
      .map((name) => `leopard-${name}-paw`);
    const sphericalIds = ['leopard-spine-joint',
      'leopard-front-left-hip-joint', 'leopard-front-right-hip-joint',
      'leopard-hind-left-hip-joint', 'leopard-hind-right-hip-joint'];
    let minimumChestHeight = Infinity;
    let minimumUpright = Infinity;
    let maximumSphericalAngle = 0;
    const pawContactTicks = [0, 0, 0, 0];
    let allFourTicks = 0;
    for (let tick = 0; tick < 600; tick += 1) {
      world.stepOnce();
      const chest = world.readPartPose('solo', 'leopard-chest');
      minimumChestHeight = Math.min(minimumChestHeight, chest.position.y);
      minimumUpright = Math.min(minimumUpright, upFromQuaternion(chest.rotation));
      let allFour = true;
      for (let index = 0; index < pawIds.length; index += 1) {
        if (pawContact(world, 'solo', pawIds[index])) pawContactTicks[index] += 1;
        else allFour = false;
      }
      if (allFour) allFourTicks += 1;
      for (const connectionId of sphericalIds) {
        maximumSphericalAngle = Math.max(maximumSphericalAngle,
          sphericalAngleMagnitude(jointValues(world, 'solo', connectionId)));
      }
    }
    const state = world.inspectEnergy('solo')!;
    const totalPawContactShare = pawContactTicks.reduce((sum, count) => sum + count, 0) / (600 * pawIds.length);
    logResult('B long stand', {
      minChestY: minimumChestHeight, minUpright: minimumUpright,
      pawContactShare: totalPawContactShare, allFourShare: allFourTicks / 600,
      maxSphericalAngle: maximumSphericalAngle, consumedEnergyJ: state.consumedEnergyJ,
      decisions: agent.inspectDecisionHistory().length,
    });
    expect(world.tick).toBe(600);
    expect(minimumChestHeight).toBeGreaterThan(0.55);
    expect(minimumUpright).toBeGreaterThan(0.55);
    expect(totalPawContactShare).toBeGreaterThan(0.25);
    expect(maximumSphericalAngle).toBeLessThan(1.25);
    expect(state.consumedEnergyJ).toBeGreaterThan(0);
    expect(agent.inspectDecisionHistory().length).toBeGreaterThan(0);
  });

  it('C: approaches an anonymous sensed target with displacement and cyclic paw contact', async () => {
    const { world, agent } = await createSoloLeopard({ x: 4.2, z: 0 });
    const initial = world.readPartPose('solo', 'leopard-chest').position;
    let rangePerceptionTicks = 0;
    let pawContactPerceptionTicks = 0;
    let movingWithPawContactTicks = 0;
    const pawCycles = [0, 0, 0, 0];
    const pawContactTicks = [0, 0, 0, 0];
    const pawIds = ['front-left', 'front-right', 'hind-left', 'hind-right']
      .map((name) => `leopard-${name}-paw`);
    const previous = [false, false, false, false];
    const previousPawPoses = pawIds.map((partId) => world.readPartPose('solo', partId));
    let previousChest = initial;
    let groundedPawTravel = 0;
    let matchedChestTravel = 0;
    const approachTicks = 360;
    let targetRangeTicks = 0;
    let minimumRangeDistance = Infinity;
    for (let tick = 0; tick < approachTicks; tick += 1) {
      world.stepOnce();
      const view = world.readSensorRuntime('solo')!.readAgentView();
      if (view.perceptions.some((perception) => perception.channel === 'contact'
        && perception.sensorId.endsWith('-paw-contact'))) pawContactPerceptionTicks += 1;
      const rangeDistances = view.perceptions.filter((perception) => perception.channel === 'range')
        .map((perception) => perception.values[3]);
      if (rangeDistances.length > 0) rangePerceptionTicks += 1;
      minimumRangeDistance = Math.min(minimumRangeDistance, ...rangeDistances);
      const head = world.readPartPose('solo', 'leopard-head').position;
      const targetPosition = world.readPartPose('anonymous-target', 'passive-object-body').position;
      const targetCenterDistance = Math.hypot(targetPosition.x - head.x,
        targetPosition.y - head.y, targetPosition.z - head.z);
      if (rangeDistances.some((distance) => distance < targetCenterDistance)) targetRangeTicks += 1;
      const velocity = world.readPartVelocity('solo', 'leopard-chest')!;
      const chest = world.readPartPose('solo', 'leopard-chest').position;
      const chestStep = Math.hypot(chest.x - previousChest.x, chest.z - previousChest.z);
      previousChest = chest;
      let anyPawContact = false;
      for (let index = 0; index < pawIds.length; index += 1) {
        const floorContacts = world.readPartContacts('solo', pawIds[index])
          .filter((contact) => contact.otherEntityId === undefined);
        const touching = floorContacts.length > 0;
        const pawPose = world.readPartPose('solo', pawIds[index]);
        if (touching) pawContactTicks[index] += 1;
        if (tick > 0 && touching !== previous[index]) pawCycles[index] += 1;
        if (touching && previous[index]) {
          const contact = floorContacts.reduce((best, candidate) =>
            candidate.impulseNs > best.impulseNs ? candidate : best);
          groundedPawTravel += groundedMaterialPointTravel(previousPawPoses[index], pawPose, contact.point);
          matchedChestTravel += chestStep;
        }
        previousPawPoses[index] = pawPose;
        previous[index] = touching;
        anyPawContact ||= touching;
      }
      if (anyPawContact && Math.hypot(velocity.x, velocity.z) > 0.03) movingWithPawContactTicks += 1;
    }
    const final = world.readPartPose('solo', 'leopard-chest').position;
    const displacement = final.x - initial.x;
    const approachDecisions = agent.inspectDecisionHistory().filter((decision) => decision.skill === 'approach').length;
    const cyclingPaws = pawCycles.filter((count) => count >= 2).length;
    logResult('C anonymous approach', {
      displacementX: displacement, rangePerceptionTicks, pawContactPerceptionTicks,
      targetRangeTicks, minimumRangeDistance,
      approachDecisions, cyclingPaws, movingWithPawContactTicks,
      groundedContactPointToChestTravel: groundedPawTravel / Math.max(1e-9, matchedChestTravel),
      pawContactShare: pawContactTicks.reduce((sum, count) => sum + count, 0) / (approachTicks * 4),
    });
    expect(rangePerceptionTicks).toBeGreaterThan(30);
    expect(pawContactPerceptionTicks).toBeGreaterThan(30);
    expect(targetRangeTicks).toBeGreaterThan(30);
    expect(approachDecisions).toBeGreaterThan(0);
    expect(displacement).toBeGreaterThan(0.6);
    expect(cyclingPaws).toBeGreaterThanOrEqual(2);
    expect(movingWithPawContactTicks).toBeGreaterThan(15);
  });

  it('D: turns toward left and right anonymous targets while lateral hip coordinates change', async () => {
    const outcomes = new Map<string, { readonly heading: number; readonly minHeading: number;
      readonly maxHeading: number; readonly hipRollRange: number; readonly hipYawRange: number;
      readonly spineYawRange: number; readonly approachDecisions: number }>();
    for (const [label, target] of [['left', { x: 2.5, z: -1.2 }], ['right', { x: 2.5, z: 1.2 }]] as const) {
      const { world, agent } = await createSoloLeopard(target);
      const hipRoll = new Map<string, number[]>();
      const hipYaw = new Map<string, number[]>();
      const spineYaw: number[] = [];
      let minHeading = Infinity;
      let maxHeading = -Infinity;
      for (let tick = 0; tick < 360; tick += 1) {
        world.stepOnce();
        const currentHeading = headingFromQuaternion(world.readPartPose('solo', 'leopard-chest').rotation);
        minHeading = Math.min(minHeading, currentHeading);
        maxHeading = Math.max(maxHeading, currentHeading);
        for (const connectionId of ['leopard-front-left-hip-joint', 'leopard-front-right-hip-joint',
          'leopard-hind-left-hip-joint', 'leopard-hind-right-hip-joint']) {
          const values = jointValues(world, 'solo', connectionId);
          if (values) {
            if (!hipRoll.has(connectionId)) hipRoll.set(connectionId, []);
            if (!hipYaw.has(connectionId)) hipYaw.set(connectionId, []);
            hipRoll.get(connectionId)!.push(values[2]);
            hipYaw.get(connectionId)!.push(values[4]);
          }
        }
        const spine = jointValues(world, 'solo', 'leopard-spine-joint');
        if (spine) spineYaw.push(spine[4]);
      }
      const heading = headingFromQuaternion(world.readPartPose('solo', 'leopard-chest').rotation);
      const result = { heading, minHeading, maxHeading,
        hipRollRange: Math.max(...[...hipRoll.values()].map(range)),
        hipYawRange: Math.max(...[...hipYaw.values()].map(range)),
        spineYawRange: range(spineYaw), approachDecisions: agent.inspectDecisionHistory()
          .filter((decision) => decision.skill === 'approach').length };
      outcomes.set(label, result);
      logResult(`D ${label} turn`, result);
    }
    const left = outcomes.get('left')!;
    const right = outcomes.get('right')!;
    expect(left.approachDecisions).toBeGreaterThan(0);
    expect(right.approachDecisions).toBeGreaterThan(0);
    expect(left.minHeading).toBeLessThan(-0.08);
    expect(right.maxHeading).toBeGreaterThan(0.08);
    expect(Math.max(left.hipRollRange, right.hipRollRange)).toBeGreaterThan(0.03);
    expect(Math.max(left.hipYawRange, right.hipYawRange)).toBeGreaterThan(0.03);
  });

  it('E: recovers a usable posture after two distinct physical impact vectors', async () => {
    const perturbations = [
      { partId: 'leopard-front-left-upper', impulse: vector(0, 0, 35) },
      { partId: 'leopard-front-right-upper', impulse: vector(20, 0, -32) },
    ];
    const results: Array<{ readonly preImpactUp: number; readonly immediatePostImpactUp: number;
      readonly minUp: number; readonly finalUp: number; readonly finalChestY: number;
      readonly displacement: number; readonly contactShare: number }> = [];
    for (const { partId, impulse } of perturbations) {
      const { world, agent } = await createSoloLeopard();
      for (let tick = 0; tick < 90; tick += 1) world.stepOnce();
      const before = world.readPartPose('solo', 'leopard-chest');
      world.applyImpact('solo', partId, impulse);
      let minUp = Infinity;
      let contactTicks = 0;
      let immediatePostImpactUp = Infinity;
      for (let tick = 0; tick < 180; tick += 1) {
        world.stepOnce();
        const chest = world.readPartPose('solo', 'leopard-chest');
        const up = upFromQuaternion(chest.rotation);
        if (tick === 0) immediatePostImpactUp = up;
        minUp = Math.min(minUp, up);
        if (['front-left', 'front-right', 'hind-left', 'hind-right']
          .map((name) => pawContact(world, 'solo', `leopard-${name}-paw`)).some(Boolean)) contactTicks += 1;
      }
      const after = world.readPartPose('solo', 'leopard-chest');
      const finalUp = upFromQuaternion(after.rotation);
      const displacement = Math.hypot(after.position.x - before.position.x,
        after.position.y - before.position.y, after.position.z - before.position.z);
      const result = { preImpactUp: upFromQuaternion(before.rotation), immediatePostImpactUp, minUp, finalUp,
        finalChestY: after.position.y, displacement,
        contactShare: contactTicks / 180 };
      results.push(result);
      logResult('E impact recovery', { ...result, decisions: agent.inspectDecisionHistory().length });
    }
    for (const result of results) {
      expect(result.minUp).toBeLessThan(result.preImpactUp - 0.01);
      expect(result.finalUp).toBeGreaterThan(result.minUp + 0.01);
      expect(result.finalUp).toBeGreaterThan(0.7);
      expect(result.finalChestY).toBeGreaterThan(0.5);
      expect(result.displacement).toBeGreaterThan(0.05);
      expect(result.contactShare).toBeGreaterThan(0.15);
    }
  });

  it('F: lets two independent Agents approach and make front-limb/head/jaw contact', async () => {
    const session = await createArenaSession();
    const { world, agents } = session;
    expect(agents.get('leopard-a')).not.toBe(agents.get('leopard-b'));
    const initialA = world.readPartPose('leopard-a', 'leopard-chest').position;
    const initialB = world.readPartPose('leopard-b', 'leopard-chest').position;
    const initialChestGap = Math.hypot(initialA.x - initialB.x, initialA.z - initialB.z);
    let minimumChestGap = Infinity;
    let opponentContactTicks = 0;
    let frontLimbContactTicks = 0;
    let headContactTicks = 0;
    let jawContactTicks = 0;
    const hipPostures = new Map<string, { readonly roll: number[]; readonly yaw: number[] }>(
      ['leopard-front-left-hip-joint', 'leopard-front-right-hip-joint',
        'leopard-hind-left-hip-joint', 'leopard-hind-right-hip-joint']
        .map((connectionId) => [connectionId, { roll: [], yaw: [] }] as const),
    );
    const neckPostures: number[] = [];
    const jawPostures: number[] = [];
    let contactPostureSamples = 0;
    for (let tick = 0; tick < 600; tick += 1) {
      world.stepOnce();
      const a = world.readPartPose('leopard-a', 'leopard-chest').position;
      const b = world.readPartPose('leopard-b', 'leopard-chest').position;
      minimumChestGap = Math.min(minimumChestGap, Math.hypot(a.x - b.x, a.z - b.z));
      const touchingPartsA = world.inspectEntity('leopard-a')!.partIds.filter((partId) =>
        world.readPartContacts('leopard-a', partId).some((contact) => contact.otherEntityId === 'leopard-b'));
      const touchingPartsB = world.inspectEntity('leopard-b')!.partIds.filter((partId) =>
        world.readPartContacts('leopard-b', partId).some((contact) => contact.otherEntityId === 'leopard-a'));
      const touchingParts = [...touchingPartsA, ...touchingPartsB];
      if (touchingParts.length > 0) opponentContactTicks += 1;
      if (touchingParts.some((partId) => partId.includes('front'))) frontLimbContactTicks += 1;
      if (touchingParts.includes('leopard-head')) headContactTicks += 1;
      if (touchingParts.includes('leopard-jaw')) jawContactTicks += 1;
      if (touchingParts.length > 0) {
        contactPostureSamples += 1;
        for (const connectionId of ['leopard-front-left-hip-joint', 'leopard-front-right-hip-joint',
          'leopard-hind-left-hip-joint', 'leopard-hind-right-hip-joint']) {
          const values = jointValues(world, 'leopard-a', connectionId);
          if (values) {
            hipPostures.get(connectionId)!.roll.push(values[2]);
            hipPostures.get(connectionId)!.yaw.push(values[4]);
          }
        }
        const neck = jointValues(world, 'leopard-a', 'leopard-neck-joint');
        const jaw = jointValues(world, 'leopard-a', 'leopard-jaw-joint');
        if (neck) neckPostures.push(neck[0]);
        if (jaw) jawPostures.push(jaw[0]);
      }
    }
    const aApproach = agents.get('leopard-a')!.inspectDecisionHistory()
      .filter((decision) => decision.skill === 'approach').length;
    const bApproach = agents.get('leopard-b')!.inspectDecisionHistory()
      .filter((decision) => decision.skill === 'approach').length;
    const aInteract = agents.get('leopard-a')!.inspectDecisionHistory()
      .filter((decision) => decision.skill === 'interact').length;
    const bInteract = agents.get('leopard-b')!.inspectDecisionHistory()
      .filter((decision) => decision.skill === 'interact').length;
    const perHipRanges = [...hipPostures.values()].map((posture) => Math.max(
      range(posture.roll), range(posture.yaw),
    ));
    const maxHipPostureRange = Math.max(0, ...perHipRanges);
    const neckPostureRange = range(neckPostures);
    const jawPostureRange = range(jawPostures);
    logResult('F dual-agent interaction', {
      minimumChestGap, opponentContactTicks, frontLimbContactTicks, headContactTicks, jawContactTicks,
      contactPostureSamples, maxHipPostureRange, neckPostureRange, jawPostureRange,
      aApproach, bApproach, aInteract, bInteract,
    });
    expect(aApproach + bApproach).toBeGreaterThan(0);
    expect(aInteract + bInteract).toBeGreaterThan(0);
    expect(minimumChestGap).toBeLessThan(initialChestGap - 0.5);
    expect(opponentContactTicks).toBeGreaterThan(5);
    expect(frontLimbContactTicks).toBeGreaterThan(0);
    expect(headContactTicks).toBeGreaterThan(5);
    expect(jawContactTicks).toBeGreaterThan(0);
    expect(contactPostureSamples).toBeGreaterThan(5);
    expect(maxHipPostureRange).toBeGreaterThan(0.03);
    expect(Math.max(neckPostureRange, jawPostureRange)).toBeGreaterThan(0.03);
  });
});
