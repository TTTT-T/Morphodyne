import { describe, expect, it } from 'vitest';
import { estimateContactAreaM2 } from './contactArea';
import { applyPartLoad, createDamageState } from '../core/damage';
import { validateBlueprint, type Blueprint } from '../core/model';

describe('generic contact concentration', () => {
  it('resolves face, edge, rounded and convex support layers reproducibly in m²', () => {
    const box = { kind: 'box', halfExtents: { x: 0.2, y: 0.1, z: 0.3 } } as const;
    expect(estimateContactAreaM2(box, { x: 0, y: 1, z: 0 })).toBeCloseTo(0.24, 10);
    const edge = estimateContactAreaM2(box, { x: 1, y: 1, z: 0 });
    expect(edge).toBeLessThan(0.002);
    const convex = { kind: 'convex', points: [-1,1].flatMap(x => [-1,1].flatMap(y => [-1,1].map(z => ({ x:x*0.2, y:y*0.1, z:z*0.3 })))) } as const;
    expect(estimateContactAreaM2(convex, { x: 1, y: 1, z: 0 })).toBeCloseTo(edge, 12);
    expect(estimateContactAreaM2({ kind: 'sphere', radius: 0.01 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(Math.PI*0.000019, 12);
    const capsule = { kind: 'capsule', radius: 0.01, halfHeight: 0.1 } as const;
    expect(estimateContactAreaM2(capsule, { x: 1, y: 0, z: 0 })).toBeGreaterThan(estimateContactAreaM2(capsule, { x: 0, y: 1, z: 0 }));
  });

  it('adds pressure response once, preserves old materials and separates fractured structure', () => {
    const blueprint: Blueprint = { id: 'generic', materials: [{ id: 'm', density: 1000, friction: 1, restitution: 0, yieldPressurePa: 1000, ultimatePressurePa: 5000 }], parts: ['a','b'].map((id,i) => ({ id, materialId: 'm', geometry: { kind: 'sphere', radius: 0.1 }, pose: { position: { x:i, y:0, z:0 }, rotation: { x:0,y:0,z:0,w:1 } } })), connections: [{ id:'link',kind:'rigid',fromPartId:'a',toPartId:'b',fromAnchor:{x:1,y:0,z:0},toAnchor:{x:0,y:0,z:0} }] };
    const load = { partId:'a', impulseNs:0, pressurePa:2000, seconds:0.1 };
    const damaged = applyPartLoad(createDamageState(blueprint), blueprint, load);
    expect(damaged.part.damage.accumulatedOverloadSeconds).toBeCloseTo(0.1);
    const fractured = applyPartLoad(damaged.state, blueprint, { ...load, peakPressurePa:6000 });
    expect(fractured.part.damage.state).toBe('fractured');
    expect(fractured.state.connections.link.connected).toBe(false);
    expect(fractured.events.some(e => e.kind === 'fracture' && e.peakPressurePa === 6000)).toBe(true);
    const legacy = { ...blueprint, materials: blueprint.materials.map(({ yieldPressurePa: _y, ultimatePressurePa: _u, ...m }) => m) };
    expect(applyPartLoad(createDamageState(legacy), legacy, load).part.damage.state).toBe('intact');
    expect(validateBlueprint({ ...blueprint, materials: [{ ...blueprint.materials[0], yieldPressurePa:6000 }] }).length).toBeGreaterThan(0);
    expect(() => applyPartLoad(createDamageState(blueprint), blueprint, { ...load, pressurePa:NaN })).toThrow();
  });
});
