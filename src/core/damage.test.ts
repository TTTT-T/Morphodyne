import { describe, expect, it } from 'vitest';
import type { Blueprint, Material, Pose } from './model';
import { validateBlueprint } from './model';
import {
  applyConnectionLoad,
  applyPartLoad,
  createDamageState,
  getConnectionLoadCapacity,
  getConnectionState,
  getPartState,
} from './damage';

const identityPose: Pose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

const material: Material = {
  id: 'material',
  density: 1000,
  friction: 0.6,
  restitution: 0.1,
  yieldImpulseNs: 10,
  toughnessImpulseNs: 100,
};

function blueprint(strengthImpulseNs: number): Blueprint {
  return {
    id: `damage-${strengthImpulseNs}`,
    materials: [material],
    parts: [
      {
        id: 'from',
        materialId: material.id,
        geometry: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
        pose: identityPose,
      },
      {
        id: 'to',
        materialId: material.id,
        geometry: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
        pose: identityPose,
      },
    ],
    connections: [{
      id: 'link',
      kind: 'rigid',
      fromPartId: 'from',
      toPartId: 'to',
      fromAnchor: { x: 0, y: 0, z: 0 },
      toAnchor: { x: 0, y: 0, z: 0 },
      strengthImpulseNs,
    }],
  };
}

function load(strengthImpulseNs: number, impulseNs: number, state = createDamageState(blueprint(strengthImpulseNs))) {
  const structure = blueprint(strengthImpulseNs);
  return applyConnectionLoad(state, structure, { connectionId: 'link', impulseNs });
}

describe('structural damage core', () => {
  it('damages a connectionless Part from direct measured load and leaves omitted capacities compatible', () => {
    const single: Blueprint = { ...blueprint(20), parts: [blueprint(20).parts[0]], connections: [] };
    const initial = createDamageState(single);
    const low = applyPartLoad(initial, single, { partId: 'from', impulseNs: 8, tick: 1 });
    expect(low.state.parts.from.damage.state).toBe('intact');
    const high = applyPartLoad(low.state, single, { partId: 'from', impulseNs: 101, tick: 2 });
    expect(high.state.parts.from.damage.state).toBe('fractured');
    expect(high.events).toContainEqual(expect.objectContaining({ target: 'part', kind: 'fracture', partId: 'from' }));
    const legacy = { ...single, materials: [{ ...material, yieldImpulseNs: undefined, toughnessImpulseNs: undefined }] };
    expect(applyPartLoad(createDamageState(legacy), legacy, { partId: 'from', impulseNs: 1000 }).state.parts.from.damage.state).toBe('intact');
  });

  it('integrates only measured sustained overload and separates every incident connection on direct fracture', () => {
    const original = blueprint(1000);
    const structure: Blueprint = { ...original,
      materials: [{ ...material, yieldImpulseNs: undefined, toughnessImpulseNs: undefined, yieldForceN: 10, ultimateForceN: 100 }],
      parts: [...original.parts, { ...original.parts[0], id: 'third' }],
      connections: [...original.connections, { ...original.connections[0], id: 'other', fromPartId: 'from', toPartId: 'third' }],
    };
    let state = createDamageState(structure);
    for (let i = 0; i < 10; i += 1) state = applyPartLoad(state, structure, { partId: 'from', impulseNs: 0, forceN: 9, seconds: 1 }).state;
    expect(state.parts.from.damage.state).toBe('intact');
    const first = applyPartLoad(state, structure, { partId: 'from', impulseNs: 0, forceN: 15, seconds: 1 });
    expect(first.part.damage.accumulatedOverloadSeconds).toBeCloseTo(0.5);
    const second = applyPartLoad(first.state, structure, { partId: 'from', impulseNs: 0, forceN: 15, seconds: 1 });
    expect(second.part.damage.state).toBe('fractured');
    expect(second.events.filter((event) => event.kind === 'separation')).toHaveLength(2);
    expect(Object.values(second.state.connections).every((entry) => !entry.connected)).toBe(true);
  });

  it('keeps external Part damage separate from internal Connection reaction in runtime mode', () => {
    const structure = blueprint(20);
    const initial = createDamageState(structure);
    const contacted = applyPartLoad(initial, structure, { partId: 'from', impulseNs: 12 });
    const response = applyConnectionLoad(contacted.state, structure, { connectionId: 'link', impulseNs: 12, loadEndpoints: false });
    expect(response.state.connections.link.damage.state).toBe('degraded');
    expect(response.state.parts.from.damage.accumulatedImpulseNs).toBe(contacted.part.damage.accumulatedImpulseNs);
    expect(response.state.parts.to.damage.state).toBe('intact');
  });
  it('starts intact and leaves a sub-yield impulse unchanged', () => {
    const structure = blueprint(20);
    const initial = createDamageState(structure);
    const result = applyConnectionLoad(initial, structure, { connectionId: 'link', impulseNs: 10, tick: 4 });

    expect(result.events).toEqual([]);
    expect(getPartState(result.state, 'from').damage.state).toBe('intact');
    expect(getConnectionState(result.state, 'link').damage.state).toBe('intact');
    expect(getConnectionLoadCapacity(result.state, 'link')).toBe(20);
  });

  it('accumulates persistent overload and separates after repeated weaker impacts', () => {
    const structure = blueprint(20);
    let state = createDamageState(structure);

    for (let index = 0; index < 4; index += 1) {
      const result = applyConnectionLoad(state, structure, { connectionId: 'link', impulseNs: 12, tick: index });
      state = result.state;
      expect(getConnectionState(state, 'link').connected).toBe(true);
      expect(getConnectionState(state, 'link').damage.state).toBe('degraded');
    }

    const final = applyConnectionLoad(state, structure, { connectionId: 'link', impulseNs: 12, tick: 4 });
    const connection = getConnectionState(final.state, 'link');
    expect(connection.connected).toBe(false);
    expect(connection.damage.state).toBe('separated');
    expect(connection.residualLoadCapacityNs).toBe(0);
    expect(final.events.map((event) => event.kind)).toContain('separation');
    expect(final.events.find((event) => event.kind === 'separation')).toMatchObject({
      connectionId: 'link',
      partIds: ['from', 'to'],
      impulseNs: 12,
      tick: 4,
    });
  });

  it('produces different outcomes for weak and strong connections under the same impulse', () => {
    const weak = load(10, 15);
    const strong = load(40, 15);

    expect(getConnectionState(weak.state, 'link').connected).toBe(false);
    expect(getConnectionState(strong.state, 'link').connected).toBe(true);
    expect(getConnectionState(strong.state, 'link').damage.state).toBe('degraded');
    expect(getConnectionLoadCapacity(strong.state, 'link')).toBeCloseTo(33.25);
  });

  it('lets material toughness fracture both endpoint structure and its dependent connection', () => {
    const brittle: Blueprint = {
      ...blueprint(100),
      id: 'brittle',
      materials: [{ ...material, yieldImpulseNs: 5, toughnessImpulseNs: 15 }],
    };
    const initial = createDamageState(brittle);
    const result = applyConnectionLoad(initial, brittle, { connectionId: 'link', impulseNs: 20 });

    expect(getPartState(result.state, 'from').damage.state).toBe('fractured');
    expect(getPartState(result.state, 'to').damage.state).toBe('fractured');
    expect(getConnectionState(result.state, 'link').damage.state).toBe('separated');
    expect(result.events.filter((event) => event.kind === 'fracture')).toHaveLength(3);
  });

  it('separates every load path attached to a fractured Part', () => {
    const original = blueprint(100);
    const structure: Blueprint = {
      ...original,
      materials: [material, { ...material, id: 'brittle', yieldImpulseNs: 5, toughnessImpulseNs: 15 }],
      parts: [original.parts[0], { ...original.parts[1], materialId: 'brittle' }, { ...original.parts[0], id: 'tail' }],
      connections: [original.connections[0], {
        ...original.connections[0], id: 'second', fromPartId: 'to', toPartId: 'tail',
      }],
    };
    const result = applyConnectionLoad(createDamageState(structure), structure, { connectionId: 'link', impulseNs: 20 });

    expect(getPartState(result.state, 'to').damage.state).toBe('fractured');
    expect(getConnectionState(result.state, 'link').connected).toBe(false);
    expect(getConnectionState(result.state, 'second').connected).toBe(false);
    expect(result.events.filter((event) => event.kind === 'separation').map((event) => event.connectionId)).toEqual(['link', 'second']);
  });

  it('rejects non-positive or non-finite structural declarations', () => {
    const invalid: Blueprint = {
      ...blueprint(20),
      id: 'invalid-damage-declarations',
      materials: [{ ...material, yieldImpulseNs: 0, toughnessImpulseNs: Number.NaN }],
      connections: [{ ...blueprint(20).connections[0], strengthImpulseNs: Number.POSITIVE_INFINITY }],
    };

    expect(validateBlueprint(invalid)).toEqual([
      'Invalid yieldImpulseNs: material',
      'Invalid toughnessImpulseNs: material',
      'Invalid strengthImpulseNs: link',
    ]);
  });

  it('does not apply additional load after a connection has separated', () => {
    const structure = blueprint(10);
    const first = applyConnectionLoad(createDamageState(structure), structure, { connectionId: 'link', impulseNs: 20 });
    const second = applyConnectionLoad(first.state, structure, { connectionId: 'link', impulseNs: 20 });

    expect(second.events).toEqual([]);
    expect(second.state).toBe(first.state);
  });

  it('does not accumulate repeated sustained sub-yield force', () => {
    const base = blueprint(20);
    const structure: Blueprint = { ...base, connections: [{ ...base.connections[0], yieldForceN: 10, ultimateForceN: 30 }] };
    let state = createDamageState(structure);
    for (let index = 0; index < 20; index += 1) {
      state = applyConnectionLoad(state, structure, { connectionId: 'link', impulseNs: 0, forceN: 9, seconds: 1 }).state;
    }
    expect(getConnectionState(state, 'link').damage.state).toBe('intact');
    expect(getConnectionState(state, 'link').damage.accumulatedOverloadSeconds).toBe(0);
  });

  it('deforms and then separates under sustained force without collision impulse', () => {
    const base = blueprint(100);
    const structure: Blueprint = { ...base, connections: [{ ...base.connections[0], yieldForceN: 10, ultimateForceN: 40 }] };
    let state = createDamageState(structure);
    state = applyConnectionLoad(state, structure, { connectionId: 'link', impulseNs: 0, forceN: 15, seconds: 1 }).state;
    expect(getConnectionState(state, 'link').damage.state).toBe('degraded');
    expect(getConnectionState(state, 'link').damage.deformation).toBeCloseTo(0.5);
    const result = applyConnectionLoad(state, structure, { connectionId: 'link', impulseNs: 0, forceN: 15, seconds: 1 });
    expect(getConnectionState(result.state, 'link').connected).toBe(false);
    expect(result.events.map((event) => event.kind)).toContain('separation');
    expect(result.events.find((event) => event.kind === 'separation')).toMatchObject({ impulseNs: 0, forceN: 15, seconds: 1 });
  });

  it('fractures and separates when sustained torque exceeds ultimate capacity', () => {
    const base = blueprint(100);
    const structure: Blueprint = { ...base, connections: [{ ...base.connections[0], yieldTorqueNm: 5, ultimateTorqueNm: 20 }] };
    const result = applyConnectionLoad(createDamageState(structure), structure, { connectionId: 'link', impulseNs: 0, torqueNm: 20, seconds: 0.01 });
    expect(getConnectionState(result.state, 'link').connected).toBe(false);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: 'separation', torqueNm: 20 }));
  });

  it('validates continuous thresholds as positive finite values and ordered pairs', () => {
    const base = blueprint(100);
    const structure: Blueprint = { ...base, materials: [{ ...material, yieldForceN: 10, ultimateForceN: 10 }], connections: [{ ...base.connections[0], yieldTorqueNm: 0 }] };
    expect(validateBlueprint(structure)).toEqual(['Invalid force thresholds: material', 'Invalid yieldTorqueNm: link']);
  });

  it('rejects a connection override whose effective yield exceeds material ultimate', () => {
    const base = blueprint(100);
    const structure: Blueprint = { ...base,
      materials: [{ ...material, ultimateForceN: 10 }],
      connections: [{ ...base.connections[0], yieldForceN: 20 }],
    };
    expect(validateBlueprint(structure)).toContain('Invalid effective force thresholds: link');
  });
});
