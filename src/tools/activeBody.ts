import type { Blueprint, Connection, Pose, Vector3 } from '../core/model';
import type { JointActuator } from '../core/actuation';

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;
const REVOLUTE_AXIS = { x: 1, y: 0, z: 0 } as const;

interface AssemblySpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

const ASSEMBLY_SPECS: readonly AssemblySpec[] = [
  { id: 'assembly-0', x: -0.85, z: -0.5 },
  { id: 'assembly-1', x: -0.85, z: 0.5 },
  { id: 'assembly-2', x: 0.85, z: -0.5 },
  { id: 'assembly-3', x: 0.85, z: 0.5 },
];

/** Neutral structural grouping for controllers and debug tools.
 *
 * The ids identify physical connections and parts only. They do not grant a
 * capability to a part; a controller still has to produce an actuator signal
 * and physics decides the resulting motion.
 */
export interface ActiveBodyAssembly {
  readonly id: string;
  readonly partIds: readonly [string, string, string];
  readonly connectionIds: readonly [string, string, string];
}

export function getActiveBodyAssemblies(): readonly ActiveBodyAssembly[] {
  return ASSEMBLY_SPECS.map(({ id }, index) => ({
    id,
    partIds: [`part-${index + 1}-a`, `part-${index + 1}-b`, `part-${index + 1}-c`] as const,
    connectionIds: [`connection-${index}-a`, `connection-${index}-b`, `connection-${index}-c`] as const,
  }));
}

function pose(x: number, y: number, z: number): Pose {
  return { position: { x, y, z }, rotation: IDENTITY_ROTATION };
}

function vector(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

/**
 * Creates a generic active assembly for Phase 2.
 *
 * Four identical articulated assemblies carry spherical end contacts around
 * a central box. A central inertial part has its own revolute connection.
 * These are only geometry, mass, material and joints; no Part has a predefined
 * ability. The controller must supply signals and Rapier decides the result.
 */
export function createActiveBlueprint(): Blueprint {
  const bodyMaterialId = 'material-body';
  const segmentMaterialId = 'material-segment';

  const parts = [
    {
      id: 'part-core',
      materialId: bodyMaterialId,
      geometry: { kind: 'box' as const, halfExtents: vector(1.15, 0.32, 0.7) },
      pose: pose(0, 1.8, 0),
      mass: 6,
    },
    {
      id: 'part-9',
      materialId: bodyMaterialId,
      geometry: { kind: 'box' as const, halfExtents: vector(0.6, 0.08, 0.6) },
      pose: pose(0, 1.8, 0),
      mass: 2,
    },
    ...ASSEMBLY_SPECS.flatMap(({ x, z }, index) => [
      {
        id: `part-${index + 1}-a`,
        materialId: segmentMaterialId,
        geometry: { kind: 'capsule' as const, radius: 0.14, halfHeight: 0.25 },
        pose: pose(x, 1.0, z),
        mass: 0.8,
      },
      {
        id: `part-${index + 1}-b`,
        materialId: segmentMaterialId,
        geometry: { kind: 'capsule' as const, radius: 0.14, halfHeight: 0.34 },
        pose: pose(x, 0.48, z),
        mass: 0.8,
      },
      {
        id: `part-${index + 1}-c`,
        materialId: segmentMaterialId,
        geometry: { kind: 'sphere' as const, radius: 0.22 },
        pose: pose(x, 0.22, z),
        mass: 0.5,
      },
    ]),
  ];

  const connections: Connection[] = ASSEMBLY_SPECS.flatMap(({ x, z }, index) => [
    {
      id: `connection-${index}-a`,
      fromPartId: 'part-core',
      toPartId: `part-${index + 1}-a`,
      strengthImpulseNs: index === 0 ? 1 : 100,
      kind: 'revolute' as const,
      fromAnchor: vector(x, -0.32, z),
      toAnchor: vector(0, 0.48, 0),
      axis: REVOLUTE_AXIS,
      limits: { min: -0.55, max: 0.55 },
    },
    {
      id: `connection-${index}-b`,
      fromPartId: `part-${index + 1}-a`,
      toPartId: `part-${index + 1}-b`,
      strengthImpulseNs: 100,
      kind: 'revolute' as const,
      fromAnchor: vector(0, -0.28, 0),
      toAnchor: vector(0, 0.24, 0),
      axis: REVOLUTE_AXIS,
      limits: { min: -0.8, max: 0.8 },
    },
    {
      id: `connection-${index}-c`,
      fromPartId: `part-${index + 1}-b`,
      toPartId: `part-${index + 1}-c`,
      strengthImpulseNs: 100,
      kind: 'revolute' as const,
      fromAnchor: vector(0, -0.26, 0),
      toAnchor: vector(0, 0, 0),
      axis: REVOLUTE_AXIS,
    },
  ]);
  connections.push({
    id: 'connection-4',
    fromPartId: 'part-core',
    toPartId: 'part-9',
    strengthImpulseNs: 100,
    kind: 'revolute',
    fromAnchor: vector(0, 0, 0),
    toAnchor: vector(0, 0, 0),
    axis: vector(0, 1, 0),
  });

  return {
    id: 'blueprint-active-body',
    materials: [
      {
        id: bodyMaterialId,
        density: 650,
        friction: 0.85,
        restitution: 0.05,
        yieldImpulseNs: 4,
        toughnessImpulseNs: 200,
      },
      {
        id: segmentMaterialId,
        density: 900,
        friction: 0.95,
        restitution: 0.02,
        yieldImpulseNs: 2,
        toughnessImpulseNs: 100,
      },
    ],
    parts,
    connections,
    actuators: connections.map((connection): JointActuator => ({
      id: `actuator-${connection.id}`,
      connectionId: connection.id,
      maxOutput: connection.id === 'connection-4' ? 30 : connection.id.endsWith('-c') ? 20 : connection.id.endsWith('-a') ? 18 : 12,
      responseTimeSeconds: 0.08,
    })),
  };
}
