import type { EnergySourceSpec, TensionActuator } from '../core/actuation';
import type { Blueprint, Material, Part, Pose, Vector3 } from '../core/model';

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;

function vector(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

function pose(x: number, y: number, z: number): Pose {
  return { position: vector(x, y, z), rotation: IDENTITY_ROTATION };
}

/**
 * The three starter structures exposed by the construction sandbox.
 *
 * These IDs identify convenience templates only. They are not Entity kinds and
 * do not carry capability or outcome semantics into the Core.
 */
export type SandboxTemplateId = 'joint-mechanism' | 'tension-mechanism' | 'gripper';

/** A finite energy store supplied to an actuated template at spawn time. */
export interface SandboxEnergySpec extends EnergySourceSpec {}

/** The optional attachment points edited by the tension template controls. */
export interface TensionMechanismOptions {
  readonly fromAttachment?: Vector3;
  readonly toAttachment?: Vector3;
}

/** Optional material/geometry values for the independent gripper payload. */
export interface GripperTemplateOptions {
  readonly payloadFriction?: number;
  readonly payloadMass?: number;
}

/**
 * A construction-ready spawn description. `energy` is deliberately separate
 * from the Blueprint because WorldRuntime owns EnergyRuntime creation.
 */
export interface SandboxTemplateSpawn {
  readonly blueprint: Blueprint;
  readonly energy?: SandboxEnergySpec;
  /**
   * The gripper's payload is a separate passive Blueprint. It must be spawned
   * as its own world Entity so contacts and motion remain physics outcomes.
   */
  readonly payloadBlueprint?: Blueprint;
}

export interface SandboxTemplateDefinition<Options = undefined> {
  readonly id: SandboxTemplateId;
  readonly label: string;
  readonly description: string;
  readonly create: (options?: Options) => SandboxTemplateSpawn;
}

const jointEnergy: SandboxEnergySpec = {
  capacityJ: 1200,
  maxPowerWatts: 180,
  efficiency: 0.8,
};

const tensionEnergy: SandboxEnergySpec = {
  capacityJ: 1600,
  maxPowerWatts: 220,
  efficiency: 0.8,
};

const gripperEnergy: SandboxEnergySpec = {
  capacityJ: 1000,
  maxPowerWatts: 160,
  efficiency: 0.75,
};

const jointMaterial: Material = {
  id: 'sandbox-joint-material',
  density: 780,
  friction: 0.65,
  restitution: 0.08,
  yieldImpulseNs: 1000,
  toughnessImpulseNs: 2000,
  yieldForceN: 4000,
  ultimateForceN: 8000,
  yieldTorqueNm: 250,
  ultimateTorqueNm: 500,
};

const tensionMaterial: Material = {
  id: 'sandbox-tension-material',
  density: 780,
  friction: 0.65,
  restitution: 0.08,
  yieldImpulseNs: 1000,
  toughnessImpulseNs: 2000,
  yieldForceN: 4000,
  ultimateForceN: 8000,
  yieldTorqueNm: 250,
  ultimateTorqueNm: 500,
};

const gripperMaterial: Material = {
  id: 'sandbox-gripper-material',
  density: 1000,
  friction: 0.1,
  restitution: 0,
  yieldImpulseNs: 100000,
  toughnessImpulseNs: 200000,
  yieldForceN: 10000,
  ultimateForceN: 20000,
  yieldTorqueNm: 10000,
  ultimateTorqueNm: 20000,
};

function box(
  id: string,
  materialId: string,
  position: Vector3,
  halfExtents: Vector3,
  mass: number,
): Part {
  return {
    id,
    materialId,
    geometry: { kind: 'box', halfExtents },
    pose: pose(position.x, position.y, position.z),
    mass,
  };
}

/** A two-Part revolute mechanism driven by a generic Joint Actuator. */
export function createJointMechanismBlueprint(): Blueprint {
  const base = box('joint-base', jointMaterial.id, vector(0, 0.3, 0), vector(0.35, 0.3, 0.35), 6);
  const arm = box('joint-arm', jointMaterial.id, vector(0.95, 0.3, 0), vector(0.6, 0.1, 0.1), 1);
  const hinge = {
    id: 'joint-hinge',
    kind: 'revolute' as const,
    fromPartId: base.id,
    toPartId: arm.id,
    fromAnchor: vector(0.35, 0, 0),
    toAnchor: vector(-0.6, 0, 0),
    axis: vector(0, 0, 1),
    limits: { min: -1.2, max: 1.2 },
  };

  return {
    id: 'sandbox-joint-mechanism',
    materials: [jointMaterial],
    parts: [base, arm],
    connections: [hinge],
    actuators: [{
      id: 'joint-drive',
      connectionId: hinge.id,
      maxOutput: 14,
      responseTimeSeconds: 0.08,
    }],
  };
}

/**
 * A revolute mechanism whose output comes from a Tension Actuator. Attachment
 * points are part-local values and can be replaced before reconstruction.
 */
export function createTensionMechanismBlueprint(options: TensionMechanismOptions = {}): Blueprint {
  const base = box('tension-base', tensionMaterial.id, vector(0, 0.8, 0), vector(0.2, 0.8, 0.25), 8);
  const arm = box('tension-arm', tensionMaterial.id, vector(0.8, 0.8, 0), vector(0.6, 0.08, 0.12), 1);
  const hinge = {
    id: 'tension-hinge',
    kind: 'revolute' as const,
    fromPartId: base.id,
    toPartId: arm.id,
    fromAnchor: vector(0.2, 0, 0),
    toAnchor: vector(-0.6, 0, 0),
    axis: vector(0, 0, 1),
    limits: { min: -1.2, max: 1.2 },
  };
  const actuator: TensionActuator = {
    id: 'tension-pull',
    kind: 'tension',
    fromPartId: base.id,
    toPartId: arm.id,
    fromAttachment: options.fromAttachment ?? vector(0, 0.55, 0),
    toAttachment: options.toAttachment ?? vector(0.35, 0, 0),
    maxOutput: 42,
    responseTimeSeconds: 0.08,
  };

  return {
    id: 'sandbox-tension-mechanism',
    materials: [tensionMaterial],
    parts: [base, arm],
    connections: [hinge],
    actuators: [actuator],
  };
}

/** Create the gripper's separate passive payload Blueprint. */
export function createSandboxPayloadBlueprint(options: GripperTemplateOptions = {}): Blueprint {
  const payloadMaterial: Material = {
    id: 'sandbox-payload-material',
    density: 1000,
    friction: options.payloadFriction ?? 1.2,
    restitution: 0,
  };
  return {
    id: 'sandbox-passive-payload',
    materials: [payloadMaterial],
    parts: [box('payload-body', payloadMaterial.id, vector(0, 2.25, 0), vector(0.22, 0.2, 0.22), options.payloadMass ?? 1)],
    connections: [],
  };
}

/**
 * A frame with two independently actuated prismatic jaws. The payload is
 * intentionally returned as a separate passive Blueprint.
 */
export function createGripperBlueprint(): Blueprint {
  const frame = box('gripper-frame', gripperMaterial.id, vector(0, 0.85, 0), vector(1, 0.7, 0.4), 100);
  const leftJaw = box('gripper-left-jaw', gripperMaterial.id, vector(-0.5, 2.25, 0), vector(0.13, 0.13, 0.13), 2);
  const rightJaw = box('gripper-right-jaw', gripperMaterial.id, vector(0.5, 2.25, 0), vector(0.13, 0.13, 0.13), 2);
  const leftSlide = {
    id: 'gripper-left-slide',
    kind: 'prismatic' as const,
    fromPartId: frame.id,
    toPartId: leftJaw.id,
    fromAnchor: vector(-0.5, 1.4, 0),
    toAnchor: vector(0, 0, 0),
    axis: vector(1, 0, 0),
    limits: { min: 0, max: 0.18 },
  };
  const rightSlide = {
    id: 'gripper-right-slide',
    kind: 'prismatic' as const,
    fromPartId: frame.id,
    toPartId: rightJaw.id,
    fromAnchor: vector(0.5, 1.4, 0),
    toAnchor: vector(0, 0, 0),
    axis: vector(1, 0, 0),
    limits: { min: -0.18, max: 0 },
  };

  return {
    id: 'sandbox-gripper',
    materials: [gripperMaterial],
    parts: [frame, leftJaw, rightJaw],
    connections: [leftSlide, rightSlide],
    actuators: [
      { id: 'gripper-left-drive', connectionId: leftSlide.id, maxOutput: 12 },
      { id: 'gripper-right-drive', connectionId: rightSlide.id, maxOutput: 12 },
    ],
  };
}

/** Create the gripper and its independent passive payload scene data. */
export function createGripperTemplate(options: GripperTemplateOptions = {}): SandboxTemplateSpawn {
  return {
    blueprint: createGripperBlueprint(),
    energy: { ...gripperEnergy },
    payloadBlueprint: createSandboxPayloadBlueprint(options),
  };
}

export const sandboxBlueprintCatalog = {
  joint: {
    id: 'joint-mechanism',
    label: '基础关节机构',
    description: '两段结构通过关节连接，由通用关节执行器驱动。',
    create: (): SandboxTemplateSpawn => ({
      blueprint: createJointMechanismBlueprint(),
      energy: { ...jointEnergy },
    }),
  } satisfies SandboxTemplateDefinition,
  tension: {
    id: 'tension-mechanism',
    label: '基础拉力机构',
    description: '通过两端局部 attachment point 施加拉力，可编辑连接点后重建。',
    create: (options: TensionMechanismOptions = {}): SandboxTemplateSpawn => ({
      blueprint: createTensionMechanismBlueprint(options),
      energy: { ...tensionEnergy },
    }),
  } satisfies SandboxTemplateDefinition<TensionMechanismOptions>,
  gripper: {
    id: 'gripper',
    label: '基础夹持机构',
    description: '两个独立的滑动执行器作用于结构，payload 保持为独立被动 Entity。',
    create: createGripperTemplate,
  } satisfies SandboxTemplateDefinition<GripperTemplateOptions>,
} as const;

/** All catalog entries in stable UI order. */
export const sandboxBlueprintTemplates: readonly SandboxTemplateDefinition<unknown>[] = [
  sandboxBlueprintCatalog.joint as SandboxTemplateDefinition<unknown>,
  sandboxBlueprintCatalog.tension as SandboxTemplateDefinition<unknown>,
  sandboxBlueprintCatalog.gripper as SandboxTemplateDefinition<unknown>,
];

export function createSandboxTemplate(id: 'joint-mechanism'): SandboxTemplateSpawn;
export function createSandboxTemplate(id: 'tension-mechanism', options?: TensionMechanismOptions): SandboxTemplateSpawn;
export function createSandboxTemplate(id: 'gripper', options?: GripperTemplateOptions): SandboxTemplateSpawn;
export function createSandboxTemplate(
  id: SandboxTemplateId,
  options: TensionMechanismOptions | GripperTemplateOptions = {},
): SandboxTemplateSpawn {
  switch (id) {
    case 'joint-mechanism':
      return sandboxBlueprintCatalog.joint.create();
    case 'tension-mechanism':
      return sandboxBlueprintCatalog.tension.create(options as TensionMechanismOptions);
    case 'gripper':
      return sandboxBlueprintCatalog.gripper.create(options as GripperTemplateOptions);
  }
}
