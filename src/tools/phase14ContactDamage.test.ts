import { describe, expect, it } from 'vitest';
import type { Blueprint, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';

const identity = { x: 0, y: 0, z: 0, w: 1 } as const;
const fixedSeconds = 1 / 60;

function boxPart(
  id: string,
  position: Vector3,
  halfExtents: Vector3,
  mass: number,
  materialId: string,
): Part {
  return {
    id,
    materialId,
    mass,
    geometry: { kind: 'box', halfExtents },
    pose: { position, rotation: identity },
  };
}

function material(
  id: string,
  options: Pick<Material, 'yieldImpulseNs' | 'toughnessImpulseNs' | 'yieldForceN' | 'ultimateForceN'> = {},
): Material {
  return {
    id,
    density: 1000,
    friction: 0.4,
    restitution: 0,
    ...options,
  };
}

function singlePartBlueprint(id: string, partMaterial: Material, part: Part): Blueprint {
  return { id, materials: [partMaterial], parts: [part], connections: [] };
}

interface TargetShape {
  readonly blueprintId: string;
  readonly halfExtents: Vector3;
  readonly mass: number;
}

const defaultImpactTargetShape: TargetShape = {
  blueprintId: 'single-target',
  halfExtents: { x: 0.35, y: 0.35, z: 0.35 },
  mass: 1,
};

const defaultCompressionTargetShape: TargetShape = {
  blueprintId: 'compression-target',
  halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
  mass: 0.5,
};

interface ImpactResult {
  readonly appliedImpulseNs: number;
  readonly peakContactImpulseNs: number;
  readonly peakContactForceN: number;
  readonly contactTicks: number;
  readonly damage: ReturnType<WorldRuntime['getDamageRuntime']>['state']['parts'][string]['damage'];
}

interface CompressionResult {
  readonly requestedOutputN: number;
  readonly peakTargetForceN: number;
  readonly forceTicks: number;
  readonly totalForceNs: number;
  readonly contactTicks: number;
  readonly damage: ReturnType<WorldRuntime['getDamageRuntime']>['state']['parts'][string]['damage'];
  readonly fractured: boolean;
}

interface StructuralFunctionResult {
  readonly impacted: boolean;
  readonly fractureTick: number;
  readonly separatedConnections: number;
  readonly componentCount: number;
  readonly actuatorIds: readonly string[];
  readonly peakContactImpulseNs: number;
  readonly peakContactForceN: number;
  readonly functionDisplacementM: number;
  readonly connectionAccumulatedImpulseNs: readonly number[];
  readonly criticalDamage: ReturnType<WorldRuntime['getDamageRuntime']>['state']['parts'][string]['damage'];
}

async function runImpactTrial(
  appliedImpulseNs: number,
  targetMaterial: Material,
  targetShape: TargetShape = defaultImpactTargetShape,
): Promise<ImpactResult> {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics);
  world.spawn({ id: 'target', blueprint: singlePartBlueprint(
    targetShape.blueprintId, targetMaterial,
    boxPart('target', { x: 0, y: 0, z: 0 }, targetShape.halfExtents, targetShape.mass, targetMaterial.id),
  ) }, { origin: { x: 0, y: 1, z: 0 } });

  const projectileMaterial = material('projectile');
  world.spawn({ id: 'projectile', blueprint: singlePartBlueprint(
    'projectile', projectileMaterial,
    boxPart('projectile', { x: 0, y: 4, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 }, 1, projectileMaterial.id),
  ) });
  world.applyImpact('projectile', 'projectile', { x: 0, y: -appliedImpulseNs, z: 0 });

  let peakContactImpulseNs = 0;
  let peakContactForceN = 0;
  let contactTicks = 0;
  for (let tick = 0; tick < 180; tick += 1) {
    world.stepOnce();
    const load = world.readPartContactLoad('target', 'target')!;
    peakContactImpulseNs = Math.max(peakContactImpulseNs, load.impulseNs);
    peakContactForceN = Math.max(peakContactForceN, load.forceN);
    if (world.readPartContacts('target', 'target').length > 0) contactTicks += 1;
  }
  return {
    appliedImpulseNs,
    peakContactImpulseNs,
    peakContactForceN,
    contactTicks,
    damage: world.getDamageRuntime('target').state.parts.target.damage,
  };
}

async function runCompressionTrial(
  requestedOutputN: number,
  ticks = 150,
  targetMaterial = material('compression-target', {
    yieldImpulseNs: 1000,
    toughnessImpulseNs: 2000,
    yieldForceN: 100,
    ultimateForceN: 2000,
  }),
  targetShape: TargetShape = defaultCompressionTargetShape,
): Promise<CompressionResult> {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({ halfExtents: { x: 4, y: 0.1, z: 4 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
  physics.createBox({ halfExtents: { x: 0.1, y: 1.5, z: 1 }, position: { x: 1.2, y: 1.5, z: 0 }, dynamic: false });
  const world = new WorldRuntime(physics);
  world.spawn({ id: 'press', blueprint: {
    id: 'actuated-press',
    materials: [material('press-material')],
    parts: [
      boxPart('base', { x: -0.8, y: 0.8, z: 0 }, { x: 0.45, y: 0.8, z: 0.45 }, 1000, 'press-material'),
      boxPart('pusher', { x: 0.2, y: 0.2, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 }, 1, 'press-material'),
    ],
    connections: [{
      id: 'press-slide', kind: 'prismatic', fromPartId: 'base', toPartId: 'pusher',
      fromAnchor: { x: 0.5, y: -0.6, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 },
      axis: { x: 1, y: 0, z: 0 }, strengthImpulseNs: 1000,
      yieldForceN: 1000, ultimateForceN: 2000,
    }],
    actuators: [{ id: 'press-output', connectionId: 'press-slide', maxOutput: requestedOutputN }],
  } }, {
    energy: { capacityJ: 100000, maxPowerWatts: 100000, efficiency: 1 },
    control: () => [{ actuatorId: 'press-output', value: 1 }],
  });
  world.spawn({ id: 'target', blueprint: singlePartBlueprint(
    targetShape.blueprintId, targetMaterial,
    boxPart('target', { x: 0, y: 0, z: 0 }, targetShape.halfExtents, targetShape.mass, targetMaterial.id),
  ) }, { origin: { x: 0.8, y: 0.2, z: 0 } });

  let peakTargetForceN = 0;
  let contactTicks = 0;
  let forceTicks = 0;
  let totalForceNs = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    world.stepOnce();
    const load = world.readPartContactLoad('target', 'target')!;
    peakTargetForceN = Math.max(peakTargetForceN, load.forceN);
    if (load.forceN > 0) forceTicks += 1;
    totalForceNs += load.forceN * fixedSeconds;
    if (world.readPartContacts('target', 'target').length > 0) contactTicks += 1;
  }
  const damage = world.getDamageRuntime('target').state.parts.target.damage;
  return {
    requestedOutputN,
    peakTargetForceN,
    forceTicks,
    totalForceNs,
    contactTicks,
    damage,
    fractured: damage.state === 'fractured',
  };
}

async function runStructuralFunctionTrial(impactCriticalPart: boolean): Promise<StructuralFunctionResult> {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics);
  let driveEnabled = true;
  const criticalMaterial = material('critical-material', {
    yieldImpulseNs: 2,
    toughnessImpulseNs: 5,
    yieldForceN: 1000,
    ultimateForceN: 2000,
  });
  const passiveMaterial = material('passive-structure');
  const blueprint: Blueprint = {
    id: 'functional-structure',
    materials: [passiveMaterial, criticalMaterial],
    parts: [
      boxPart('base', { x: 0, y: 2, z: 0 }, { x: 0.4, y: 0.4, z: 0.4 }, 100, passiveMaterial.id),
      boxPart('critical', { x: 0.8, y: 2, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 }, 1, criticalMaterial.id),
      boxPart('payload', { x: 1.2, y: 2, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 }, 1, passiveMaterial.id),
    ],
    connections: [
      {
        id: 'drive', kind: 'prismatic', fromPartId: 'base', toPartId: 'critical',
        fromAnchor: { x: 0.4, y: 0, z: 0 }, toAnchor: { x: -0.4, y: 0, z: 0 },
        axis: { x: 1, y: 0, z: 0 }, strengthImpulseNs: 1000,
        yieldForceN: 1000, ultimateForceN: 2000,
      },
      {
        id: 'critical-link', kind: 'rigid', fromPartId: 'critical', toPartId: 'payload',
        fromAnchor: { x: 0.2, y: 0, z: 0 }, toAnchor: { x: -0.2, y: 0, z: 0 },
        strengthImpulseNs: 1000,
      },
    ],
    actuators: [{ id: 'drive-output', connectionId: 'drive', maxOutput: 20 }],
  };
  world.spawn({ id: 'structure', blueprint }, {
    energy: { capacityJ: 100000, maxPowerWatts: 100000, efficiency: 1 },
    control: () => driveEnabled ? [{ actuatorId: 'drive-output', value: 1 }] : [],
  });
  const structureBody = world.getPhysicsBody('structure');

  driveEnabled = false;
  if (impactCriticalPart) {
    const target = world.readPartPose('structure', 'critical').position;
    const projectileMaterial = material('projectile');
    world.spawn({ id: 'projectile', blueprint: singlePartBlueprint(
      'projectile', projectileMaterial,
      boxPart('projectile', { x: target.x, y: target.y + 4, z: target.z }, { x: 0.2, y: 0.2, z: 0.2 }, 1, projectileMaterial.id),
    ) });
    world.applyImpact('projectile', 'projectile', { x: 0, y: -18, z: 0 });
  }

  let fractureTick = -1;
  let peakContactImpulseNs = 0;
  let peakContactForceN = 0;
  const preludeTicks = 30;
  for (let tick = 0; tick < preludeTicks; tick += 1) {
    world.stepOnce();
    const contactLoad = world.readPartContactLoad('structure', 'critical')!;
    peakContactImpulseNs = Math.max(peakContactImpulseNs, contactLoad.impulseNs);
    peakContactForceN = Math.max(peakContactForceN, contactLoad.forceN);
    if (fractureTick < 0 && world.getDamageRuntime('structure').state.parts.critical.damage.state === 'fractured') {
      fractureTick = tick;
    }
  }

  if (impactCriticalPart && fractureTick < 0) throw new Error('Critical Part did not fracture in structural loss experiment');
  const before = structureBody.readPartPose('critical').position.x
    - structureBody.readPartPose('base').position.x;
  driveEnabled = true;
  for (let tick = 0; tick < 60; tick += 1) world.stepOnce();
  const after = structureBody.readPartPose('critical').position.x
    - structureBody.readPartPose('base').position.x;
  const state = world.getDamageRuntime('structure').state;
  const damage = state.parts.critical.damage;
  return {
    impacted: impactCriticalPart,
    fractureTick,
    separatedConnections: Object.values(state.connections).filter((connection) => !connection.connected).length,
    componentCount: world.listComponents().filter((component) => component.sourceEntityId === 'structure').length,
    actuatorIds: world.inspectEntity('structure')!.actuatorIds,
    peakContactImpulseNs,
    peakContactForceN,
    functionDisplacementM: after - before,
    connectionAccumulatedImpulseNs: Object.values(state.connections)
      .map((connection) => connection.damage.accumulatedImpulseNs),
    criticalDamage: damage,
  };
}

describe('v0.3 Phase 14 external Part contact damage', () => {
  it('Experiment A: a connection-free Part responds to low and high real impacts', async () => {
    const partMaterial = material('target-material', { yieldImpulseNs: 2, toughnessImpulseNs: 5, yieldForceN: 1000, ultimateForceN: 2000 });
    const low = await runImpactTrial(3, partMaterial);
    const high = await runImpactTrial(18, partMaterial);
    console.info('Phase14 A', { low, high });

    expect(low.contactTicks).toBeGreaterThan(0);
    expect(high.contactTicks).toBeGreaterThan(0);
    expect(high.peakContactImpulseNs).toBeGreaterThan(low.peakContactImpulseNs);
    expect(low.damage.state).not.toBe('fractured');
    expect(high.damage.state).toBe('fractured');
  });

  it('Experiment B: identical impact conditions produce a material-dependent response', async () => {
    const weakMaterial = material('same-target-material', { yieldImpulseNs: 2, toughnessImpulseNs: 5, yieldForceN: 1000, ultimateForceN: 2000 });
    const strongMaterial = material('same-target-material', { yieldImpulseNs: 20, toughnessImpulseNs: 50, yieldForceN: 1000, ultimateForceN: 2000 });
    const weak = await runImpactTrial(18, weakMaterial);
    const strong = await runImpactTrial(18, strongMaterial);
    console.info('Phase14 B', { weak, strong });

    expect(strong.appliedImpulseNs).toBe(weak.appliedImpulseNs);
    expect(strong.peakContactImpulseNs).toBeCloseTo(weak.peakContactImpulseNs, 5);
    expect(weak.damage.state).toBe('fractured');
    expect(strong.damage.state).toBe('intact');
    expect(weak.damage.integrity).toBeLessThan(strong.damage.integrity);
  });

  it('Experiment C: an actuated non-Agent press causes sustained target load through contact force', async () => {
    const low = await runCompressionTrial(10);
    const high = await runCompressionTrial(60);
    console.info('Phase14 C', { low, high });

    expect(low.contactTicks).toBeGreaterThan(0);
    expect(high.contactTicks).toBeGreaterThan(0);
    expect(low.forceTicks).toBeGreaterThan(0);
    expect(high.forceTicks).toBeGreaterThan(0);
    expect(low.totalForceNs).toBeGreaterThan(0);
    expect(high.totalForceNs).toBeGreaterThan(low.totalForceNs * 2);
    expect(high.peakTargetForceN).toBeGreaterThan(low.peakTargetForceN * 2);
    expect(low.fractured).toBe(false);
    expect(high.fractured).toBe(true);
    expect(low.damage.accumulatedImpulseNs).toBe(0);
    expect(high.damage.accumulatedImpulseNs).toBe(0);
  });

  it('Experiment D: a launched source and an actuated source share the same Part load response', async () => {
    const sharedMaterial = material('shared-target', {
      yieldImpulseNs: 2,
      toughnessImpulseNs: 30,
      yieldForceN: 100,
      ultimateForceN: 2000,
    });
    const sharedTargetShape: TargetShape = {
      blueprintId: 'shared-target',
      halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
      mass: 0.5,
    };
    const launched = await runImpactTrial(8, sharedMaterial, sharedTargetShape);
    const actuated = await runCompressionTrial(10, 60, sharedMaterial, sharedTargetShape);
    console.info('Phase14 D', { launched, actuated });

    expect(launched.contactTicks).toBeGreaterThan(0);
    expect(actuated.contactTicks).toBeGreaterThan(0);
    expect(launched.damage.state).toBe('degraded');
    expect(actuated.damage.state).toBe('degraded');
    expect(launched.damage.integrity).toBeLessThan(1);
    expect(actuated.damage.integrity).toBeLessThan(1);
    expect(launched.damage.accumulatedImpulseNs).toBeGreaterThan(0);
    expect(actuated.damage.accumulatedOverloadSeconds).toBeGreaterThan(0);
    expect(actuated.peakTargetForceN).toBeGreaterThan(launched.peakContactForceN * 0.5);
    expect(actuated.peakTargetForceN).toBeLessThan(launched.peakContactForceN * 2);
    expect(actuated.damage.deformation).toBeLessThan(launched.damage.deformation * 3);
  });

  it('Experiment E: contact fracture separates incident structure and removes its physical function', async () => {
    const intact = await runStructuralFunctionTrial(false);
    const impacted = await runStructuralFunctionTrial(true);
    console.info('Phase14 E', { intact, impacted });

    expect(intact.criticalDamage.state).not.toBe('fractured');
    expect(intact.functionDisplacementM).toBeGreaterThan(0.01);
    expect(impacted.impacted).toBe(true);
    expect(impacted.criticalDamage.state).toBe('fractured');
    expect(impacted.peakContactImpulseNs).toBeGreaterThan(0);
    expect(impacted.peakContactForceN).toBeGreaterThan(0);
    expect(impacted.separatedConnections).toBe(2);
    expect(impacted.componentCount).toBe(3);
    expect(impacted.actuatorIds).toEqual([]);
    expect(impacted.connectionAccumulatedImpulseNs).toEqual([0, 0]);
    expect(Math.abs(impacted.functionDisplacementM)).toBeLessThan(intact.functionDisplacementM * 0.5);
  });
});
