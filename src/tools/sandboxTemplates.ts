import type { GodSandboxCatalogEntry } from './GodSandboxPanel';
import {
  createGripperBlueprint,
  createJointMechanismBlueprint,
  createTensionMechanismBlueprint,
  sandboxBlueprintCatalog,
} from './sandboxBlueprintCatalog';

/**
 * Panel-facing catalog adapter. The panel receives a fresh Blueprint factory;
 * the richer `sandboxBlueprintCatalog` remains available to callers that also
 * need the gripper's independent payload scene data or finite energy spec.
 */
export const SANDBOX_CATALOG: readonly GodSandboxCatalogEntry[] = [
  {
    id: sandboxBlueprintCatalog.joint.id,
    label: sandboxBlueprintCatalog.joint.label,
    blueprint: createJointMechanismBlueprint,
    spawnOptions: { energy: { ...sandboxBlueprintCatalog.joint.create().energy! } },
  },
  {
    id: sandboxBlueprintCatalog.tension.id,
    label: sandboxBlueprintCatalog.tension.label,
    blueprint: createTensionMechanismBlueprint,
    spawnOptions: { energy: { ...sandboxBlueprintCatalog.tension.create().energy! } },
  },
  {
    id: sandboxBlueprintCatalog.gripper.id,
    label: sandboxBlueprintCatalog.gripper.label,
    blueprint: createGripperBlueprint,
    spawnOptions: { energy: { ...sandboxBlueprintCatalog.gripper.create().energy! } },
  },
];
