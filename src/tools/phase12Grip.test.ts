import { describe, expect, it } from 'vitest';
import type { Blueprint, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import { WorldRuntime } from '../simulation/WorldRuntime';

const identity = { x: 0, y: 0, z: 0, w: 1 } as const;
const fixedSeconds = 1 / 60;
const holdTicks = 150;
const settlingTicks = 30;
const floorTop = 0;
// The frame top is approximately 1.4 m after settling. A payload resting on
// that passive support is no longer suspended by the jaws.
const suspendedHeight = 1.85;

const gripperMaterial: Material = {
  id: 'gripper-steel', density: 1000, friction: 0.1, restitution: 0,
  yieldImpulseNs: 100000, toughnessImpulseNs: 200000,
  yieldForceN: 10000, ultimateForceN: 20000,
  yieldTorqueNm: 10000, ultimateTorqueNm: 20000,
};

function box(id: string, position: Vector3, halfExtents: Vector3, mass: number, materialId = gripperMaterial.id): Part {
  return {
    id, materialId, mass, geometry: { kind: 'box', halfExtents },
    pose: { position, rotation: identity },
  };
}

function sphere(id: string, position: Vector3, radius: number, mass: number, materialId = gripperMaterial.id): Part {
  return {
    id, materialId, mass, geometry: { kind: 'sphere', radius },
    pose: { position, rotation: identity },
  };
}

function gripperBlueprint(): Blueprint {
  return {
    id: 'two-jaw-gripper',
    materials: [gripperMaterial],
    parts: [
      box('frame', { x: 0, y: 0.85, z: 0 }, { x: 1, y: 0.7, z: 0.4 }, 100),
      sphere('left-jaw', { x: -0.5, y: 2.25, z: 0 }, 0.13, 2),
      sphere('right-jaw', { x: 0.5, y: 2.25, z: 0 }, 0.13, 2),
    ],
    connections: [
      {
        id: 'left-slide', kind: 'prismatic', fromPartId: 'frame', toPartId: 'left-jaw',
        fromAnchor: { x: -0.5, y: 1.4, z: 0 }, toAnchor: { x: 0, y: 0, z: 0 },
        axis: { x: 1, y: 0, z: 0 }, limits: { min: 0, max: 0.18 },
      },
      {
        id: 'right-slide', kind: 'prismatic', fromPartId: 'frame', toPartId: 'right-jaw',
        fromAnchor: { x: 0.5, y: 1.4, z: 0 }, toAnchor: { x: 0, y: 0, z: 0 },
        axis: { x: 1, y: 0, z: 0 }, limits: { min: -0.18, max: 0 },
      },
    ],
    actuators: [
      { id: 'left-close', kind: 'joint', connectionId: 'left-slide', maxOutput: 12 },
      { id: 'right-close', kind: 'joint', connectionId: 'right-slide', maxOutput: 12 },
    ],
  };
}

function payloadBlueprint(friction: number): Blueprint {
  const payloadMaterial: Material = {
    id: 'payload-material', density: 1000, friction, restitution: 0,
  };
  return {
    id: 'independent-payload',
    materials: [payloadMaterial],
    parts: [box('payload', { x: 0, y: 2.25, z: 0 }, { x: 0.22, y: 0.2, z: 0.22 }, 1, payloadMaterial.id)],
    connections: [],
  };
}

interface GripMeasurement {
  readonly payloadFriction: number;
  readonly payloadMassKg: number;
  readonly actuatorOutputN: number;
  readonly holdDurationSeconds: number;
  readonly bothJawContactTicks: number;
  readonly maxConsecutiveBothJawContactTicks: number;
  readonly leftJawContactTicks: number;
  readonly rightJawContactTicks: number;
  readonly payloadDisplacementM: number;
  readonly payloadDropM: number;
  readonly energyConsumedJ: number;
  readonly peakStructuralForceN: number;
  readonly peakStructuralTorqueNm: number;
  readonly damage: number;
  readonly payloadStayedSuspended: boolean;
}

function hasSurfaceContact(contacts: readonly { point: Vector3 }[], side: 'left' | 'right'): boolean {
  return contacts.some(({ point }) => side === 'left' ? point.x < -0.08 : point.x > 0.08);
}

async function grippingTrial(payloadFriction: number): Promise<GripMeasurement> {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({
    halfExtents: { x: 4, y: 0.1, z: 4 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false,
    friction: 0.2,
  });

  const world = new WorldRuntime(physics);
  const construction = new ConstructionRuntime(world);
  const actuatorOutputN = 12;
  construction.spawn({ id: 'gripper', blueprint: gripperBlueprint() }, {
    energy: { capacityJ: 1000, maxPowerWatts: 1000, efficiency: 1 },
    control: () => [
      { actuatorId: 'left-close', value: 1 },
      { actuatorId: 'right-close', value: -1 },
    ],
  });
  construction.spawn({ id: 'payload', blueprint: payloadBlueprint(payloadFriction) });

  const gripperBody = world.getPhysicsBody('gripper');
  const payloadBody = world.getPhysicsBody('payload');
  const initialPayloadY = world.readPartPose('payload', 'payload').position.y;
  let bothJawContactTicks = 0;
  let maxConsecutiveBothJawContactTicks = 0;
  let consecutiveBothJawContactTicks = 0;
  let leftJawContactTicks = 0;
  let rightJawContactTicks = 0;
  let minPayloadY = initialPayloadY;
  let maxPayloadY = initialPayloadY;
  let peakStructuralForceN = 0;
  let peakStructuralTorqueNm = 0;
  let payloadStayedSuspended = true;

  for (let tick = 0; tick < settlingTicks + holdTicks; tick += 1) {
    world.stepOnce();

    const payloadPose = world.readPartPose('payload', 'payload');
    const payloadContacts = physics.readPartContacts(payloadBody, 'payload');
    const leftContacts = physics.readPartContacts(gripperBody, 'left-jaw');
    const rightContacts = physics.readPartContacts(gripperBody, 'right-jaw');
    const leftJawContact = leftContacts.length > 0 && hasSurfaceContact(payloadContacts, 'left');
    const rightJawContact = rightContacts.length > 0 && hasSurfaceContact(payloadContacts, 'right');
    const suspended = payloadPose.position.y > floorTop + suspendedHeight;
    const heldByBothJaws = tick >= settlingTicks && suspended && leftJawContact && rightJawContact;

    if (tick >= settlingTicks) {
      minPayloadY = Math.min(minPayloadY, payloadPose.position.y);
      maxPayloadY = Math.max(maxPayloadY, payloadPose.position.y);
    }
    if (tick >= settlingTicks && !suspended) payloadStayedSuspended = false;
    if (tick >= settlingTicks && leftJawContact) leftJawContactTicks += 1;
    if (tick >= settlingTicks && rightJawContact) rightJawContactTicks += 1;
    if (heldByBothJaws) {
      bothJawContactTicks += 1;
      consecutiveBothJawContactTicks += 1;
      maxConsecutiveBothJawContactTicks = Math.max(maxConsecutiveBothJawContactTicks, consecutiveBothJawContactTicks);
    } else if (tick >= settlingTicks) {
      consecutiveBothJawContactTicks = 0;
    }

    const leftLoad = physics.readConnectionLoad(gripperBody, 'left-slide');
    const rightLoad = physics.readConnectionLoad(gripperBody, 'right-slide');
    peakStructuralForceN = Math.max(peakStructuralForceN, leftLoad.forceN, rightLoad.forceN);
    peakStructuralTorqueNm = Math.max(peakStructuralTorqueNm, leftLoad.torqueNm, rightLoad.torqueNm);
  }

  const damage = Math.max(
    world.getDamageRuntime('gripper').state.connections['left-slide'].damage.deformation,
    world.getDamageRuntime('gripper').state.connections['right-slide'].damage.deformation,
  );
  return {
    payloadFriction,
    payloadMassKg: 1,
    actuatorOutputN,
    holdDurationSeconds: bothJawContactTicks * fixedSeconds,
    bothJawContactTicks,
    maxConsecutiveBothJawContactTicks,
    leftJawContactTicks,
    rightJawContactTicks,
    payloadDisplacementM: maxPayloadY - minPayloadY,
    payloadDropM: initialPayloadY - minPayloadY,
    energyConsumedJ: world.inspectEnergy('gripper')!.consumedEnergyJ,
    peakStructuralForceN,
    peakStructuralTorqueNm,
    damage,
    payloadStayedSuspended,
  };
}

describe('Phase 12 Experiment B: friction creates gripping', () => {
  it('holds an independent payload with high friction and loses it with low friction', async () => {
    const highFriction = await grippingTrial(1.2);
    const lowFriction = await grippingTrial(0.01);
    console.info('Phase12 B controlled comparison', {
      controlledVariables: ['gripper Blueprint', 'jaw geometry', 'jaw material', 'payload mass', 'actuator output', 'energy source', 'floor', 'control input', 'step count'],
      changedVariable: 'payload material friction',
      highFriction,
      lowFriction,
    });

    expect(highFriction.payloadMassKg).toBe(lowFriction.payloadMassKg);
    expect(highFriction.actuatorOutputN).toBe(lowFriction.actuatorOutputN);
    expect(highFriction.energyConsumedJ).toBeGreaterThan(0);
    expect(lowFriction.energyConsumedJ).toBeGreaterThan(0);
    expect(highFriction.damage).toBe(0);
    expect(lowFriction.damage).toBe(0);
    expect(highFriction.leftJawContactTicks).toBeGreaterThan(holdTicks * 0.9);
    expect(highFriction.rightJawContactTicks).toBeGreaterThan(holdTicks * 0.9);
    expect(highFriction.maxConsecutiveBothJawContactTicks).toBeGreaterThan(holdTicks * 0.9);
    expect(highFriction.payloadStayedSuspended).toBe(true);
    expect(highFriction.payloadDropM).toBeLessThan(0.35);
    expect(lowFriction.maxConsecutiveBothJawContactTicks).toBeLessThan(holdTicks * 0.5);
    expect(lowFriction.payloadDropM).toBeGreaterThan(highFriction.payloadDropM + 0.3);
    expect(lowFriction.holdDurationSeconds).toBeLessThan(highFriction.holdDurationSeconds * 0.5);
    expect(highFriction.peakStructuralTorqueNm).toBeGreaterThan(0);
    expect(lowFriction.peakStructuralTorqueNm).toBeGreaterThan(0);
  });
});
