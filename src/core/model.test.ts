import { describe, expect, it } from 'vitest';
import type { Blueprint, Entity, Pose, WorldEvent } from './model';
import { validateBlueprint } from './model';

const identityPose: Pose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

const blueprint: Blueprint = {
  id: 'sample',
  materials: [{ id: 'mat', density: 1000, friction: 0.6, restitution: 0.1 }],
  parts: [{
    id: 'body',
    materialId: 'mat',
    geometry: { kind: 'box', halfExtents: { x: 1, y: 1, z: 1 } },
    pose: identityPose,
  }],
  connections: [],
};

describe('Core structural model', () => {
  it('accepts a mixed physical structure without semantic abilities', () => {
    const mixed: Blueprint = {
      id: 'mixed',
      materials: [
        { id: 'dense', density: 7800, friction: 0.5, restitution: 0.15 },
        { id: 'light', density: 500, friction: 0.8, restitution: 0.05 },
      ],
      parts: [
        {
          id: 'core',
          materialId: 'dense',
          geometry: { kind: 'box', halfExtents: { x: 1, y: 0.5, z: 0.75 } },
          pose: identityPose,
          mass: 10,
        },
        {
          id: 'sphere',
          materialId: 'light',
          geometry: { kind: 'sphere', radius: 0.25 },
          pose: { ...identityPose, position: { x: 1.5, y: 0, z: 0 } },
        },
        {
          id: 'capsule',
          materialId: 'light',
          geometry: { kind: 'capsule', radius: 0.15, halfHeight: 0.5 },
          pose: { ...identityPose, position: { x: -1.5, y: 0, z: 0 } },
        },
        {
          id: 'convex',
          materialId: 'dense',
          geometry: {
            kind: 'convex',
            points: [
              { x: 0, y: 0, z: 0 },
              { x: 1, y: 0, z: 0 },
              { x: 0, y: 1, z: 0 },
              { x: 0, y: 0, z: 1 },
            ],
          },
          pose: identityPose,
        },
      ],
      connections: [
        {
          id: 'fixed-core-sphere',
          kind: 'rigid',
          fromPartId: 'core',
          toPartId: 'sphere',
          fromAnchor: { x: 1, y: 0, z: 0 },
          toAnchor: { x: -0.5, y: 0, z: 0 },
        },
        {
          id: 'hinge-core-capsule',
          kind: 'revolute',
          fromPartId: 'core',
          toPartId: 'capsule',
          fromAnchor: { x: -1, y: 0, z: 0 },
          toAnchor: { x: 0.5, y: 0, z: 0 },
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -0.5, max: 0.5 },
        },
        {
          id: 'slide-core-convex',
          kind: 'prismatic',
          fromPartId: 'core',
          toPartId: 'convex',
          fromAnchor: { x: 0, y: 0.5, z: 0 },
          toAnchor: { x: 0, y: 0.5, z: 0 },
          axis: { x: 0, y: 1, z: 0 },
          limits: { min: -0.25, max: 0.25 },
        },
      ],
    };

    expect(validateBlueprint(mixed)).toEqual([]);
  });

  it('accepts a minimal structure without semantic abilities', () => {
    const entity: Entity = { id: 'entity-1', blueprint };
    expect(validateBlueprint(entity.blueprint)).toEqual([]);
    expect(Object.keys(entity)).toEqual(['id', 'blueprint']);
  });

  it('rejects a connection whose initial anchors do not meet', () => {
    const shifted: Blueprint = {
      ...blueprint,
      parts: [blueprint.parts[0], {
        ...blueprint.parts[0], id: 'other',
        pose: { ...identityPose, position: { x: 1, y: 0, z: 0 } },
      }],
      connections: [{
        id: 'link', kind: 'rigid', fromPartId: 'body', toPartId: 'other',
        fromAnchor: { x: 0, y: 0, z: 0 }, toAnchor: { x: 0, y: 0, z: 0 },
      }],
    };
    expect(validateBlueprint(shifted)).toEqual(['Misaligned connection anchors: link']);
  });

  it('rejects invalid physical data and references', () => {
    const invalid: Blueprint = {
      ...blueprint,
      parts: [
        {
          ...blueprint.parts[0],
          materialId: 'missing',
          geometry: { kind: 'box', halfExtents: { x: 0, y: 1, z: Number.NaN } },
          pose: { position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 0 } },
          mass: 0,
        },
        {
          id: 'sphere',
          materialId: 'mat',
          geometry: { kind: 'sphere', radius: 0 },
          pose: identityPose,
        },
        {
          id: 'capsule',
          materialId: 'mat',
          geometry: { kind: 'capsule', radius: -1, halfHeight: Number.POSITIVE_INFINITY },
          pose: identityPose,
        },
        {
          id: 'flat-convex',
          materialId: 'mat',
          geometry: {
            kind: 'convex',
            points: [
              { x: 0, y: 0, z: 0 },
              { x: 1, y: 0, z: 0 },
              { x: 0, y: 1, z: 0 },
              { x: 1, y: 1, z: 0 },
            ],
          },
          pose: identityPose,
        },
      ],
      connections: [
        {
          id: 'bad-joint',
          kind: 'revolute',
          fromPartId: 'body',
          toPartId: 'missing',
          fromAnchor: { x: Number.NaN, y: 0, z: 0 },
          toAnchor: { x: 0, y: 0, z: 0 },
          axis: { x: 0, y: 0, z: 0 },
          limits: { min: 1, max: -1 },
        },
      ],
    };

    expect(validateBlueprint(invalid)).toEqual([
      'Unknown material: missing',
      'Invalid geometry: body',
      'Invalid pose: body',
      'Invalid mass: body',
      'Invalid geometry: sphere',
      'Invalid geometry: capsule',
      'Invalid geometry: flat-convex',
      'Unknown connection endpoint: bad-joint',
      'Invalid connection anchors: bad-joint',
      'Invalid connection axis: bad-joint',
      'Invalid connection limits: bad-joint',
    ]);
  });

  it('records factual events without intent labels', () => {
    const event: WorldEvent = { tick: 2, kind: 'contact', partIds: ['body'] };
    expect(event.kind).toBe('contact');
  });
});
