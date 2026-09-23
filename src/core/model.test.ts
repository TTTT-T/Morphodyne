import { describe, expect, it } from 'vitest';
import type { Blueprint, Entity, WorldEvent } from './model';
import { validateBlueprint } from './model';

const blueprint: Blueprint = {
  id: 'sample',
  materials: [{ id: 'mat', density: 1000, friction: 0.6, restitution: 0.1 }],
  parts: [{ id: 'body', materialId: 'mat', geometry: { kind: 'box', halfExtents: { x: 1, y: 1, z: 1 } } }],
  connections: [],
};

describe('Core structural model', () => {
  it('accepts a minimal structure without semantic abilities', () => {
    const entity: Entity = { id: 'entity-1', blueprint };
    expect(validateBlueprint(entity.blueprint)).toEqual([]);
    expect(Object.keys(entity)).toEqual(['id', 'blueprint']);
  });

  it('rejects missing references and invalid physical dimensions', () => {
    const invalid: Blueprint = {
      ...blueprint,
      parts: [{ ...blueprint.parts[0], materialId: 'missing', geometry: { kind: 'box', halfExtents: { x: 0, y: 1, z: 1 } } }],
      connections: [{ id: 'link', fromPartId: 'body', toPartId: 'missing', kind: 'rigid' }],
    };
    expect(validateBlueprint(invalid)).toEqual([
      'Unknown material: missing', 'Invalid geometry: body', 'Unknown connection endpoint: link',
    ]);
  });

  it('records factual events without intent labels', () => {
    const event: WorldEvent = { tick: 2, kind: 'contact', partIds: ['body'] };
    expect(event.kind).toBe('contact');
  });
});
