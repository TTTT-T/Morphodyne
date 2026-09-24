import { describe, expect, it } from 'vitest';
import { validateEnergySourceSpec } from '../core/actuation';
import { validateBlueprint } from '../core/model';
import {
  createGripperBlueprint,
  createGripperTemplate,
  createJointMechanismBlueprint,
  createSandboxPayloadBlueprint,
  createSandboxTemplate,
  createTensionMechanismBlueprint,
  sandboxBlueprintTemplates,
} from './sandboxBlueprintCatalog';
import { SANDBOX_CATALOG } from './sandboxTemplates';

describe('Phase 13 sandbox Blueprint catalog', () => {
  it('exposes three valid generic structures with finite energy for every actuated spawn', () => {
    const joint = createSandboxTemplate('joint-mechanism');
    const tension = createSandboxTemplate('tension-mechanism');
    const gripper = createSandboxTemplate('gripper');

    expect(sandboxBlueprintTemplates.map((template) => template.id)).toEqual([
      'joint-mechanism', 'tension-mechanism', 'gripper',
    ]);
    expect(SANDBOX_CATALOG.map((template) => template.id)).toEqual([
      'joint-mechanism', 'tension-mechanism', 'gripper',
    ]);
    for (const spawn of [joint, tension, gripper]) {
      expect(validateBlueprint(spawn.blueprint)).toEqual([]);
      expect(spawn.blueprint.actuators?.length).toBeGreaterThan(0);
      expect(spawn.energy).toBeDefined();
      expect(validateEnergySourceSpec(spawn.energy!)).toEqual([]);
      expect(spawn.energy!.capacityJ).toBeGreaterThan(0);
      expect(spawn.energy!.maxPowerWatts).toBeGreaterThan(0);
    }
  });

  it('keeps tension attachment points editable as Part-local actuator data', () => {
    const points = {
      fromAttachment: { x: 0.02, y: 0.42, z: -0.04 },
      toAttachment: { x: -0.28, y: 0.01, z: 0.06 },
    } as const;
    const blueprint = createTensionMechanismBlueprint(points);
    const actuator = blueprint.actuators?.[0];

    expect(actuator).toMatchObject({
      kind: 'tension',
      fromAttachment: points.fromAttachment,
      toAttachment: points.toAttachment,
    });
    expect(validateBlueprint(blueprint)).toEqual([]);
  });

  it('returns a passive payload as a separate gripper scene Blueprint', () => {
    const spawn = createGripperTemplate({ payloadFriction: 0.3, payloadMass: 1.5 });
    const standalonePayload = createSandboxPayloadBlueprint();
    expect(validateBlueprint(createJointMechanismBlueprint())).toEqual([]);
    expect(validateBlueprint(createGripperBlueprint())).toEqual([]);
    expect(validateBlueprint(standalonePayload)).toEqual([]);
    expect(spawn.payloadBlueprint).toBeDefined();
    expect(spawn.payloadBlueprint?.connections).toEqual([]);
    expect(spawn.payloadBlueprint?.actuators).toBeUndefined();
    expect(spawn.payloadBlueprint?.parts[0]?.mass).toBe(1.5);
    const payloadMaterial = spawn.payloadBlueprint?.materials[0];
    expect(payloadMaterial?.friction).toBe(0.3);
  });

  it('creates independent instances so attachment edits do not leak between spawns', () => {
    const first = createSandboxTemplate('tension-mechanism', {
      fromAttachment: { x: 0, y: 0.1, z: 0 },
    });
    const second = createSandboxTemplate('tension-mechanism');
    expect(first.blueprint).not.toBe(second.blueprint);
    expect(first.blueprint.actuators?.[0]).not.toBe(second.blueprint.actuators?.[0]);
    expect(first.blueprint.actuators?.[0]).toMatchObject({ fromAttachment: { x: 0, y: 0.1, z: 0 } });
    expect(second.blueprint.actuators?.[0]).toMatchObject({ fromAttachment: { x: 0, y: 0.55, z: 0 } });
  });
});
