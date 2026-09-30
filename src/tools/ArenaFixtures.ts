import type { Blueprint, Connection, Material, Part, Vector3 } from '../core/model';

const identity = { x: 0, y: 0, z: 0, w: 1 } as const;
const v = (x: number, y: number, z: number): Vector3 => ({ x, y, z });

function box(id: string, materialId: string, position: Vector3, size: Vector3, mass: number): Part {
  return { id, materialId, mass, geometry: { kind: 'box', halfExtents: size },
    pose: { position, rotation: identity } };
}

function wheel(id: string, position: Vector3): Part {
  return { id, materialId: 'arena-tread', mass: 0.65,
    geometry: { kind: 'sphere', radius: 0.28 }, pose: { position, rotation: identity } };
}

const frameMaterial: Material = {
  id: 'arena-frame', density: 900, friction: 0.8, restitution: 0.05,
  yieldImpulseNs: 35, toughnessImpulseNs: 75, yieldForceN: 1800, ultimateForceN: 3800,
};
const treadMaterial: Material = {
  id: 'arena-tread', density: 900, friction: 1.8, restitution: 0,
  yieldImpulseNs: 100, toughnessImpulseNs: 200, yieldForceN: 3000, ultimateForceN: 6000,
};
const contactMaterial: Material = {
  id: 'arena-contact', density: 850, friction: 0.9, restitution: 0,
  yieldImpulseNs: 1.7, toughnessImpulseNs: 3.5, yieldForceN: 170, ultimateForceN: 700,
};

function vehicleParts(prefix: string): Part[] {
  return [
    box(`${prefix}-chassis`, frameMaterial.id, v(0, 0.47, 0), v(0.55, 0.18, 0.34), 3.5),
    wheel(`${prefix}-left-wheel`, v(-0.13, 0.28, -0.43)),
    wheel(`${prefix}-right-wheel`, v(-0.13, 0.28, 0.43)),
  ];
}

function wheelConnections(prefix: string): Connection[] {
  return [-1, 1].map((sign) => {
    const side = sign < 0 ? 'left' : 'right';
    return { id: `${prefix}-${side}-axle`, kind: 'revolute',
      fromPartId: `${prefix}-chassis`, toPartId: `${prefix}-${side}-wheel`,
      fromAnchor: v(-0.13, -0.19, sign * 0.43), toAnchor: v(0, 0, 0),
      axis: v(0, 0, 1), strengthImpulseNs: 80,
      yieldForceN: 2000, ultimateForceN: 4000,
      yieldTorqueNm: 800, ultimateTorqueNm: 1600 };
  });
}

function wheelActuators(prefix: string) {
  return ['left', 'right'].map((side) => ({
    id: `${prefix}-${side}-drive`, connectionId: `${prefix}-${side}-axle`,
    maxOutput: 8, responseTimeSeconds: 0.08,
  }));
}

/** Two ordinary wheel joints push against the floor; the front piece is only geometry and material. */
export function createRammerBlueprint(): Blueprint {
  return {
    id: 'arena-rammer-blueprint', materials: [frameMaterial, treadMaterial],
    parts: [...vehicleParts('rammer'),
      box('rammer-nose', frameMaterial.id, v(0.82, 0.47, 0), v(0.27, 0.11, 0.2), 0.8)],
    connections: [...wheelConnections('rammer'), {
      id: 'rammer-nose-mount', kind: 'rigid',
      fromPartId: 'rammer-chassis', toPartId: 'rammer-nose',
      fromAnchor: v(0.55, 0, 0), toAnchor: v(-0.27, 0, 0),
      strengthImpulseNs: 45, yieldForceN: 1500, ultimateForceN: 3000,
    }],
    actuators: wheelActuators('rammer'),
  };
}

/** A second wheel-driven structure whose two prismatic jaw Parts close through ordinary joint output. */
export function createGripperFighterBlueprint(): Blueprint {
  const jaw = (side: 'left' | 'right', z: number) =>
    box(`gripper-${side}-jaw`, contactMaterial.id, v(-0.81, 0.47, z), v(0.27, 0.13, 0.1), 0.55);
  return {
    id: 'arena-gripper-blueprint', materials: [frameMaterial, treadMaterial, contactMaterial],
    parts: [...vehicleParts('gripper'), jaw('left', -0.26), jaw('right', 0.26)],
    connections: [...wheelConnections('gripper'),
      { id: 'gripper-left-slide', kind: 'prismatic',
        fromPartId: 'gripper-chassis', toPartId: 'gripper-left-jaw',
        fromAnchor: v(-0.81, 0, -0.26), toAnchor: v(0, 0, 0), axis: v(0, 0, 1),
        limits: { min: 0, max: 0.19 }, strengthImpulseNs: 12,
        yieldForceN: 320, ultimateForceN: 750 },
      { id: 'gripper-right-slide', kind: 'prismatic',
        fromPartId: 'gripper-chassis', toPartId: 'gripper-right-jaw',
        fromAnchor: v(-0.81, 0, 0.26), toAnchor: v(0, 0, 0), axis: v(0, 0, 1),
        limits: { min: -0.19, max: 0 }, strengthImpulseNs: 12,
        yieldForceN: 320, ultimateForceN: 750 }],
    actuators: [...wheelActuators('gripper'),
      { id: 'gripper-left-close', connectionId: 'gripper-left-slide', maxOutput: 38, responseTimeSeconds: 0.08 },
      { id: 'gripper-right-close', connectionId: 'gripper-right-slide', maxOutput: 38, responseTimeSeconds: 0.08 }],
  };
}
