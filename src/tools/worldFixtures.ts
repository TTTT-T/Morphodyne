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

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;

function vector(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

function pose(x: number, y: number, z: number): Pose {
  return { position: vector(x, y, z), rotation: IDENTITY_ROTATION };
}

/**
 * A single physical object with no optional Agent systems.
 *
 * The pose is local to the Blueprint. A WorldRuntime can place several
 * instances by supplying different origins when constructing their bodies.
 */
export function createPassiveObjectBlueprint(options: {
  readonly halfExtents?: Vector3;
  readonly mass?: number;
} = {}): Blueprint {
  const halfExtents = options.halfExtents ?? vector(0.65, 0.5, 0.65);
  const material: Material = {
    id: 'passive-object-material',
    density: 650,
    friction: 0.75,
    restitution: 0.1,
  };
  const body: Part = {
    id: 'passive-object-body',
    materialId: material.id,
    geometry: { kind: 'box', halfExtents },
    pose: pose(0, halfExtents.y, 0),
    mass: options.mass ?? 3,
  };

  return {
    id: 'blueprint-passive-object',
    materials: [material],
    parts: [body],
    connections: [],
  };
}

/**
 * A small two-Part mechanism. Its output is expressed only through a generic
 * joint actuator; no controller or Agent is required to drive it.
 */
export function createActuatedMachineBlueprint(): Blueprint {
  const material: Material = {
    id: 'actuated-machine-material',
    density: 780,
    friction: 0.65,
    restitution: 0.08,
  };
  const base: Part = {
    id: 'machine-base',
    materialId: material.id,
    geometry: { kind: 'box', halfExtents: vector(0.7, 0.3, 0.45) },
    pose: pose(0, 0.3, 0),
    mass: 4,
  };
  const arm: Part = {
    id: 'machine-arm',
    materialId: material.id,
    geometry: { kind: 'box', halfExtents: vector(0.6, 0.12, 0.12) },
    pose: pose(1.3, 0.3, 0),
    mass: 0.8,
  };
  const hinge: Connection = {
    id: 'machine-hinge',
    fromPartId: base.id,
    toPartId: arm.id,
    kind: 'revolute',
    fromAnchor: vector(0.7, 0, 0),
    toAnchor: vector(-0.6, 0, 0),
    axis: vector(0, 0, 1),
    limits: { min: -1.2, max: 1.2 },
  };
  const actuator: JointActuator = {
    id: 'machine-hinge-actuator',
    connectionId: hinge.id,
    maxOutput: 12,
    responseTimeSeconds: 0.08,
  };

  return {
    id: 'blueprint-actuated-machine',
    materials: [material],
    parts: [base, arm],
    connections: [hinge],
    actuators: [actuator],
  };
}

/**
 * A physical platform with a range sensor and no Agent dependency.
 *
 * The sensor points along +X. A nearby object is intentionally a separate
 * world Entity: callers can spawn one beside this Blueprint and observe it
 * through the ordinary PhysicsAdapter ray query.
 */
export function createSensorPlatformBlueprint(): Blueprint {
  const material: Material = {
    id: 'sensor-platform-material',
    density: 600,
    friction: 0.7,
    restitution: 0.05,
  };
  const platform: Part = {
    id: 'sensor-platform-body',
    materialId: material.id,
    geometry: { kind: 'box', halfExtents: vector(0.7, 0.5, 0.55) },
    pose: pose(0, 0.5, 0),
    mass: 3,
  };
  const rangeSensor: Sensor = {
    id: 'sensor-platform-range',
    kind: 'range',
    partId: platform.id,
    localPose: pose(0, 0.45, 0),
    forward: vector(1, 0, 0),
    updatePeriodTicks: 1,
    noise: { standardDeviation: 0 },
    latencyTicks: 0,
    range: 4,
    fieldOfViewRadians: Math.PI / 4,
    resolution: 5,
  };

  return {
    id: 'blueprint-sensor-platform',
    materials: [material],
    parts: [platform],
    connections: [],
    sensors: [rangeSensor],
  };
}
