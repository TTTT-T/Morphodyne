import { describe, expect, it } from 'vitest';
import { validateBlueprint } from '../core/model';
import { createSandboxTemplate } from './sandboxBlueprintCatalog';
import { LabLibrary, parseLabDesign, type LabDesign, type LabStorage } from './LabDesign';

const check = validateBlueprint;

function makeDesign(name = '夹持实验'): LabDesign {
  const gripper = createSandboxTemplate('gripper');
  if (!gripper.payloadBlueprint) throw new Error('gripper fixture must include an independent payload');
  return {
    format: 'morphodyne-lab',
    version: 1,
    name,
    experiment: 'grip',
    environment: { weather: 'rain', timeOfDay: 18.5 },
    timeScale: 0.5,
    impulse: { x: 1.25, y: 0, z: -0.5 },
    entities: [
      {
        key: 'gripper', blueprint: gripper.blueprint, origin: { x: 0, y: 0, z: 0 },
        energy: gripper.energy, controls: Object.fromEntries(gripper.blueprint.actuators!.map(a => [a.id, 0.25])),
      },
      {
        key: 'payload', blueprint: gripper.payloadBlueprint, origin: { x: 0, y: 0, z: 0 },
        controls: {}, companionOf: 'gripper',
      },
    ],
  };
}

class MemoryStorage implements LabStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('storage unavailable');
    this.values.set(key, value);
  }
}

describe('playable lab design integrity', () => {
  it('round-trips the independent payload, initial energy, controls, and environment', () => {
    const original = makeDesign();
    const loaded = parseLabDesign(JSON.stringify(original), check);

    expect(loaded).toEqual(original);
    expect(loaded.entities).toHaveLength(2);
    expect(loaded.entities[1]).toMatchObject({ key: 'payload', companionOf: 'gripper', controls: {} });
    expect(loaded.entities[1]?.blueprint).not.toBe(loaded.entities[0]?.blueprint);
    expect(loaded.entities[0]).toMatchObject({
      energy: original.entities[0]?.energy,
      controls: original.entities[0]?.controls,
    });
    expect(loaded.environment).toEqual({ weather: 'rain', timeOfDay: 18.5 });
  });

  it('rejects invalid blueprints, out-of-range controls, duplicate keys, and broken companion links', () => {
    const invalidBlueprint = makeDesign();
    const badBlueprintDesign = structuredClone(invalidBlueprint);
    (badBlueprintDesign.entities[0]!.blueprint.materials[0] as { friction: number }).friction = -1;
    expect(() => parseLabDesign(JSON.stringify(badBlueprintDesign), check)).toThrow('蓝图校验失败');
    expect(() => parseLabDesign(JSON.stringify({
      ...invalidBlueprint,
      entities: invalidBlueprint.entities.map((entity, index) => index === 0
        ? { ...entity, controls: { 'gripper-left-drive': 2 } }
        : entity),
    }), check)).toThrow('控制信号无效');
    expect(() => parseLabDesign(JSON.stringify({ ...invalidBlueprint, timeScale: 2 }), check)).toThrow('模拟速度无效');
    expect(() => parseLabDesign(JSON.stringify({
      ...invalidBlueprint,
      entities: invalidBlueprint.entities.map(entity => ({ ...entity, key: 'same' })),
    }), check)).toThrow('重复物体编号');
    expect(() => parseLabDesign(JSON.stringify({
      ...invalidBlueprint,
      entities: invalidBlueprint.entities.map((entity, index) => index === 1 ? { ...entity, companionOf: 'missing' } : entity),
    }), check)).toThrow('独立载荷关系');
  });

  it('replaces only the same-named library entry and deletion preserves other designs', () => {
    const storage = new MemoryStorage();
    const library = new LabLibrary(storage, check);
    library.save(makeDesign('夹持实验'));
    library.save(makeDesign('起重实验'));
    const replacement = { ...makeDesign('夹持实验'), timeScale: 1 as const };
    library.save(replacement);

    expect(library.list().map(entry => [entry.name, entry.timeScale])).toEqual([
      ['起重实验', 0.5], ['夹持实验', 1],
    ]);
    library.delete('起重实验');
    expect(library.list().map(entry => entry.name)).toEqual(['夹持实验']);
  });

  it('keeps the prior stored value when storage rejects a write or existing data is damaged', () => {
    const storage = new MemoryStorage();
    const library = new LabLibrary(storage, check);
    library.save(makeDesign('既有作品'));
    const key = [...storage.values.keys()][0]!;
    const before = storage.getItem(key);

    storage.failWrites = true;
    expect(() => library.save(makeDesign('新作品'))).toThrow('storage unavailable');
    expect(storage.getItem(key)).toBe(before);

    storage.failWrites = false;
    storage.values.set(key, '{damaged');
    expect(() => library.save(makeDesign('新作品'))).toThrow();
    expect(storage.getItem(key)).toBe('{damaged');
  });
});
