import type { JointActuator } from '../core/actuation';
import type {
  Blueprint,
  Connection,
  Material,
  Part,
  Pose,
  Sensor,
  Vector3,
} from '../core/model';

/** Local body convention: front is +X, up is +Y, and left is -Z. */
export interface LeopardBlueprintOptions {
  /** Facing direction in the arena. Defaults to +X. */
  readonly facing?: 1 | -1;
}

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;
const REVERSED_ROTATION = { x: 0, y: 1, z: 0, w: 0 } as const;

const vector = (x: number, y: number, z: number): Vector3 => ({ x, y, z });
const localPose = (x = 0, y = 0, z = 0): Pose => ({
  position: vector(x, y, z),
  rotation: IDENTITY_ROTATION,
});

const bodyMaterial: Material = {
  id: 'leopard-body',
  density: 550,
  friction: 0.85,
  restitution: 0.05,
  yieldImpulseNs: 24,
  toughnessImpulseNs: 120,
  yieldForceN: 1800,
  ultimateForceN: 3600,
  yieldTorqueNm: 500,
  ultimateTorqueNm: 1100,
};

const limbMaterial: Material = {
  id: 'leopard-limb',
  density: 650,
  friction: 0.95,
  restitution: 0.04,
  yieldImpulseNs: 14,
  toughnessImpulseNs: 70,
  yieldForceN: 1200,
  ultimateForceN: 2600,
  yieldTorqueNm: 300,
  ultimateTorqueNm: 760,
};

const contactMaterial: Material = {
  id: 'leopard-contact',
  density: 800,
  friction: 1.15,
  restitution: 0.02,
  yieldImpulseNs: 9,
  toughnessImpulseNs: 45,
  yieldForceN: 850,
  ultimateForceN: 1900,
  yieldTorqueNm: 220,
  ultimateTorqueNm: 520,
};

/** A separately modeled cranial material can fail under repeated real head contact. */
const headMaterial: Material = {
  id: 'leopard-head-material', density: 650, friction: 0.9, restitution: 0.03,
  yieldImpulseNs: 1.2, toughnessImpulseNs: 7.0,
  yieldForceN: 500, ultimateForceN: 1200,
  yieldTorqueNm: 100, ultimateTorqueNm: 300,
};

interface ConnectionLoad {
  readonly strengthImpulseNs: number;
  readonly yieldForceN: number;
  readonly ultimateForceN: number;
  readonly yieldTorqueNm: number;
  readonly ultimateTorqueNm: number;
}

const bodyConnectionLoad: ConnectionLoad = {
  strengthImpulseNs: 72,
  yieldForceN: 1500,
  ultimateForceN: 3300,
  yieldTorqueNm: 420,
  ultimateTorqueNm: 980,
} as const;

const limbConnectionLoad: ConnectionLoad = {
  strengthImpulseNs: 48,
  yieldForceN: 950,
  ultimateForceN: 2200,
  yieldTorqueNm: 260,
  ultimateTorqueNm: 650,
} as const;

const pawConnectionLoad: ConnectionLoad = {
  strengthImpulseNs: 36,
  yieldForceN: 720,
  ultimateForceN: 1650,
  yieldTorqueNm: 200,
  ultimateTorqueNm: 480,
} as const;

const facingPosition = (position: Vector3, facing: 1 | -1): Vector3 => facing === 1
  ? position
  : vector(-position.x, position.y, -position.z);

function makePart(
  facing: 1 | -1,
  id: string,
  materialId: string,
  geometry: Part['geometry'],
  position: Vector3,
  mass: number,
): Part {
  return {
    id,
    materialId,
    geometry,
    mass,
    pose: {
      position: facingPosition(position, facing),
      rotation: facing === 1 ? IDENTITY_ROTATION : REVERSED_ROTATION,
    },
  };
}

function revolute(
  id: string,
  fromPartId: string,
  toPartId: string,
  fromAnchor: Vector3,
  toAnchor: Vector3,
  axis: Vector3,
  load: ConnectionLoad,
  limits?: { readonly min: number; readonly max: number },
): Connection {
  return {
    id,
    kind: 'revolute',
    fromPartId,
    toPartId,
    fromAnchor,
    toAnchor,
    axis,
    ...(limits ? { limits } : {}),
    ...load,
  };
}

function rigid(
  id: string,
  fromPartId: string,
  toPartId: string,
  fromAnchor: Vector3,
  toAnchor: Vector3,
  load: ConnectionLoad,
): Connection {
  return {
    id,
    kind: 'rigid',
    fromPartId,
    toPartId,
    fromAnchor,
    toAnchor,
    ...load,
  };
}

interface LegSpec {
  readonly region: 'front' | 'hind';
  readonly side: 'left' | 'right';
  readonly x: number;
  readonly z: number;
  readonly torsoPartId: 'leopard-chest' | 'leopard-pelvis';
}

const legs: readonly LegSpec[] = [
  { region: 'front', side: 'left', x: 0.72, z: -0.5, torsoPartId: 'leopard-chest' },
  { region: 'front', side: 'right', x: 0.72, z: 0.5, torsoPartId: 'leopard-chest' },
  { region: 'hind', side: 'left', x: -1.15, z: -0.5, torsoPartId: 'leopard-pelvis' },
  { region: 'hind', side: 'right', x: -1.15, z: 0.5, torsoPartId: 'leopard-pelvis' },
];

function legPartId(leg: LegSpec, segment: 'upper' | 'lower' | 'paw'): string {
  return `leopard-${leg.region}-${leg.side}-${segment}`;
}

function legJointConnectionId(leg: LegSpec, joint: 'hip' | 'knee'): string {
  return `leopard-${leg.region}-${leg.side}-${joint}-joint`;
}

function legPawConnectionId(leg: LegSpec): string {
  return `leopard-${leg.region}-${leg.side}-paw`;
}

function legActuatorId(leg: LegSpec, joint: 'hip' | 'knee'): string {
  return `leopard-${leg.region}-${leg.side}-${joint}`;
}

function jointActuator(
  id: string,
  connectionId: string,
  maxOutput: number,
): JointActuator {
  return { id, connectionId, maxOutput, responseTimeSeconds: 0.12 };
}

function contactSensor(
  id: string,
  partId: string,
  range: number,
  forward: Vector3,
): Sensor {
  return {
    id,
    kind: 'contact',
    partId,
    localPose: localPose(),
    forward,
    updatePeriodTicks: 1,
    noise: { standardDeviation: 0 },
    latencyTicks: 0,
    range,
    resolution: 100,
  };
}

/**
 * Build the reusable 20-Part physical Leopard body.
 *
 * The Blueprint contains no animal-specific Core types or outcome shortcuts.
 * It is an ordinary articulated structure: a low torso, four jointed legs,
 * a revolute spine/neck/jaw, and three revolute tail segments. `facing: -1`
 * rotates every initial Part pose by pi around local Y so two instances can
 * face one another while all anchors and sensor directions remain local.
 */
export function createLeopardBlueprint(options: LeopardBlueprintOptions = {}): Blueprint {
  const facing = options.facing ?? 1;

  const parts: Part[] = [
    makePart(facing, 'leopard-chest', bodyMaterial.id,
      { kind: 'box', halfExtents: vector(0.72, 0.3, 0.38) }, vector(0.25, 0.93, 0), 6.8),
    makePart(facing, 'leopard-pelvis', bodyMaterial.id,
      { kind: 'box', halfExtents: vector(0.52, 0.3, 0.4) }, vector(-0.99, 0.87, 0), 4.2),
    makePart(facing, 'leopard-neck', limbMaterial.id,
      { kind: 'box', halfExtents: vector(0.17, 0.2, 0.22) }, vector(1.14, 1.14, 0), 1.2),
    makePart(facing, 'leopard-head', headMaterial.id,
      { kind: 'box', halfExtents: vector(0.3, 0.22, 0.24) }, vector(1.61, 1.28, 0), 1.6),
    makePart(facing, 'leopard-jaw', contactMaterial.id,
      { kind: 'box', halfExtents: vector(0.35, 0.06, 0.21) }, vector(1.8, 1.0, 0), 0.55),
    makePart(facing, 'leopard-tail-1', limbMaterial.id,
      { kind: 'box', halfExtents: vector(0.28, 0.12, 0.13) }, vector(-1.79, 0.82, 0), 1.0),
    makePart(facing, 'leopard-tail-2', limbMaterial.id,
      { kind: 'box', halfExtents: vector(0.21, 0.1, 0.11) }, vector(-2.28, 0.82, 0), 0.65),
    makePart(facing, 'leopard-tail-3', contactMaterial.id,
      { kind: 'box', halfExtents: vector(0.15, 0.08, 0.09) }, vector(-2.64, 0.82, 0), 0.35),
  ];

  for (const leg of legs) {
    parts.push(
      makePart(facing, legPartId(leg, 'upper'), limbMaterial.id,
        { kind: 'box', halfExtents: vector(0.14, 0.2, 0.1) }, vector(leg.x, 0.66, leg.z), 0.65),
      makePart(facing, legPartId(leg, 'lower'), limbMaterial.id,
        { kind: 'box', halfExtents: vector(0.12, 0.16, 0.1) }, vector(leg.x, 0.3, leg.z), 0.5),
      makePart(facing, legPartId(leg, 'paw'), contactMaterial.id,
        { kind: 'box', halfExtents: vector(0.23, 0.07, 0.14) }, vector(leg.x + 0.04, 0.07, leg.z), 0.28),
    );
  }

  const connections: Connection[] = [
    revolute('leopard-spine-joint', 'leopard-chest', 'leopard-pelvis',
      vector(-0.72, -0.06, 0), vector(0.52, 0, 0), vector(0, 0, 1), bodyConnectionLoad,
      { min: -0.45, max: 0.45 }),
    revolute('leopard-neck-joint', 'leopard-chest', 'leopard-neck',
      vector(0.72, 0.21, 0), vector(-0.17, 0, 0), vector(0, 0, 1), bodyConnectionLoad,
      { min: -0.65, max: 0.5 }),
    rigid('leopard-neck-head', 'leopard-neck', 'leopard-head',
      vector(0.17, 0, 0), vector(-0.3, -0.14, 0), bodyConnectionLoad),
    revolute('leopard-jaw-joint', 'leopard-head', 'leopard-jaw',
      vector(-0.16, -0.22, 0), vector(-0.35, 0.06, 0), vector(0, 0, 1), limbConnectionLoad,
      { min: -0.1, max: 0.7 }),
    revolute('leopard-pelvis-tail-1', 'leopard-pelvis', 'leopard-tail-1',
      vector(-0.52, -0.05, 0), vector(0.28, 0, 0), vector(0, 0, 1), bodyConnectionLoad,
      { min: -0.6, max: 0.6 }),
    revolute('leopard-tail-1-tail-2', 'leopard-tail-1', 'leopard-tail-2',
      vector(-0.28, 0, 0), vector(0.21, 0, 0), vector(0, 0, 1), limbConnectionLoad,
      { min: -0.7, max: 0.7 }),
    revolute('leopard-tail-2-tail-3', 'leopard-tail-2', 'leopard-tail-3',
      vector(-0.21, 0, 0), vector(0.15, 0, 0), vector(0, 0, 1), limbConnectionLoad,
      { min: -0.8, max: 0.8 }),
  ];

  for (const leg of legs) {
    const upper = legPartId(leg, 'upper');
    const lower = legPartId(leg, 'lower');
    const paw = legPartId(leg, 'paw');
    connections.push(
    revolute(legJointConnectionId(leg, 'hip'), leg.torsoPartId, upper,
        vector(
          leg.x - (leg.torsoPartId === 'leopard-chest' ? 0.25 : -0.99),
          leg.torsoPartId === 'leopard-chest' ? -0.07 : -0.01,
          leg.z,
        ),
        vector(0, 0.2, 0), vector(0, 0, 1), limbConnectionLoad,
        { min: -0.8, max: 0.8 }),
    revolute(legJointConnectionId(leg, 'knee'), upper, lower,
        vector(0, -0.2, 0), vector(0, 0.16, 0), vector(0, 0, 1), limbConnectionLoad,
        { min: -1.35, max: 0.75 }),
      revolute(legPawConnectionId(leg), lower, paw,
        vector(0, -0.16, 0), vector(-0.04, 0.07, 0), vector(0, 0, 1), pawConnectionLoad,
        { min: -0.6, max: 0.6 }),
    );
  }

  const actuators: JointActuator[] = [];
  for (const leg of legs) {
    actuators.push(
      jointActuator(legActuatorId(leg, 'hip'), legJointConnectionId(leg, 'hip'), 36),
      jointActuator(legActuatorId(leg, 'knee'), legJointConnectionId(leg, 'knee'), 30),
      jointActuator(`leopard-${leg.region}-${leg.side}-ankle`, legPawConnectionId(leg), 16),
    );
  }
  actuators.push(
    jointActuator('leopard-jaw-close', 'leopard-jaw-joint', 18),
    jointActuator('leopard-neck-pitch', 'leopard-neck-joint', 24),
    jointActuator('leopard-spine-pitch', 'leopard-spine-joint', 28),
    jointActuator('leopard-tail-1-pitch', 'leopard-pelvis-tail-1', 12),
    jointActuator('leopard-tail-2-pitch', 'leopard-tail-1-tail-2', 10),
    jointActuator('leopard-tail-3-pitch', 'leopard-tail-2-tail-3', 8),
  );

  const sensors: Sensor[] = [
    {
      id: 'leopard-torso-proprioception',
      kind: 'proprioception',
      partId: 'leopard-chest',
      localPose: localPose(),
      forward: vector(1, 0, 0),
      updatePeriodTicks: 1,
      noise: { standardDeviation: 0 },
      latencyTicks: 0,
      resolution: 100,
    },
    ...legs.map((leg) => contactSensor(
      `${legPartId(leg, 'paw')}-contact`, legPartId(leg, 'paw'), 0.26, vector(0, -1, 0),
    )),
    contactSensor('leopard-head-contact', 'leopard-head', 0.5, vector(1, 0, 0)),
    contactSensor('leopard-jaw-contact', 'leopard-jaw', 0.4, vector(1, 0, 0)),
    {
      id: 'leopard-head-range',
      kind: 'range',
      partId: 'leopard-head',
      localPose: localPose(0.24, 0, 0),
      forward: vector(1, 0, 0),
      updatePeriodTicks: 1,
      noise: { standardDeviation: 0.01 },
      latencyTicks: 0,
      range: 5.5,
      fieldOfViewRadians: Math.PI / 2,
      resolution: 9,
    },
  ];

  return {
    id: 'leopard-blueprint',
    materials: [bodyMaterial, limbMaterial, contactMaterial, headMaterial],
    parts,
    connections,
    actuators,
    sensors,
  };
}
