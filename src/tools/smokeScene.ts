import type { Blueprint, Pose, Vector3 } from '../core/model';

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;

function blueprintPose(x: number, y: number, z: number): Pose {
  return {
    position: { x, y, z },
    rotation: IDENTITY_ROTATION,
  };
}

function vector(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

/**
 * A deliberately generic passive assembly used to exercise structural physics.
 * The ids carry no ability or species meaning: one box and four symmetric
 * capsules are connected by fixed structural joints.
 */
export function createPassiveBlueprint(): Blueprint {
  const materialId = 'material-0';
  const supportPositions = [
    [-1.15, 0.1, -0.5],
    [-1.15, 0.1, 0.5],
    [1.15, 0.1, -0.5],
    [1.15, 0.1, 0.5],
  ] as const;

  const parts = [
    {
      id: 'part-0',
      materialId,
      geometry: { kind: 'box' as const, halfExtents: vector(1.5, 0.35, 0.75) },
      pose: blueprintPose(0, 1.15, 0),
    },
    ...supportPositions.map(([x, y, z], index) => ({
      id: `part-${index + 1}`,
      materialId,
      geometry: { kind: 'capsule' as const, radius: 0.2, halfHeight: 0.55 },
      pose: blueprintPose(x, y, z),
    })),
  ];

  const connections = supportPositions.map(([x, _y, z], index) => ({
    id: `connection-${index}`,
    fromPartId: 'part-0',
    toPartId: `part-${index + 1}`,
    kind: 'rigid' as const,
    // The two anchors coincide in blueprint space at the top of each support.
    fromAnchor: vector(x, -0.3, z),
    toAnchor: vector(0, 0.75, 0),
  }));

  return {
    id: 'blueprint-passive-assembly',
    materials: [
      {
        id: materialId,
        density: 500,
        friction: 0.8,
        restitution: 0.1,
      },
    ],
    parts,
    connections,
  };
}
