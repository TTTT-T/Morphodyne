import { describe, expect, it } from 'vitest';
import { validateBlueprint } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { createActiveBlueprint, getActiveBodyAssemblies } from './activeBody';

describe('active body Blueprint', () => {
  it('defines a valid symmetric multi-part revolute structure', () => {
    const blueprint = createActiveBlueprint();
    const assemblies = getActiveBodyAssemblies();

    expect(validateBlueprint(blueprint)).toEqual([]);
    expect(blueprint.parts).toHaveLength(14);
    expect(blueprint.connections).toHaveLength(13);
    expect(blueprint.actuators).toHaveLength(13);
    expect(blueprint.actuators?.map((actuator) => actuator.connectionId)).toEqual(
      blueprint.connections.map((connection) => connection.id),
    );
    expect(assemblies).toHaveLength(4);
    expect(assemblies.flatMap((assembly) => assembly.connectionIds)).toHaveLength(12);

    const partById = new Map(blueprint.parts.map((part) => [part.id, part]));
    for (const connection of blueprint.connections) {
      expect(connection.kind).toBe('revolute');
      expect(connection.axis).toEqual(connection.id === 'connection-4' ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
      const from = partById.get(connection.fromPartId);
      const to = partById.get(connection.toPartId);
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      expect(from?.pose.rotation).toEqual(to?.pose.rotation);
    }
  });

  it('settles with all four lower segments in ground contact', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({
      halfExtents: { x: 8, y: 0.1, z: 8 },
      position: { x: 0, y: -0.1, z: 0 },
      dynamic: false,
    });
    const body = physics.createBody({ id: 'active-body', blueprint: createActiveBlueprint() });

    for (let tick = 0; tick < 240; tick += 1) physics.step(1 / 60);

    const core = body.readPartPose('part-core').position;
    expect(core.y).toBeGreaterThan(1.25);
    expect(core.y).toBeLessThan(2.35);
    for (const assembly of getActiveBodyAssemblies()) {
      const lower = body.readPartPose(assembly.partIds[1]).position;
      expect(lower.y).toBeGreaterThan(0.35);
      expect(lower.y).toBeLessThan(0.75);
    }
  });
});
