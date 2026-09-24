import { describe, expect, it } from 'vitest';
import { RapierPhysicsAdapter } from './RapierPhysicsAdapter';

function threePartEntity() {
  const material = { id: 'material', density: 1, friction: 0.5, restitution: 0 };
  const pose = (x: number) => ({
    position: { x, y: 2, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  });
  return {
    id: 'three-part',
    blueprint: {
      id: 'three-part',
      materials: [material],
      parts: [
        { id: 'a', materialId: material.id, geometry: { kind: 'box' as const, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }, pose: pose(0) },
        { id: 'b', materialId: material.id, geometry: { kind: 'box' as const, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }, pose: pose(1) },
        { id: 'c', materialId: material.id, geometry: { kind: 'box' as const, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }, pose: pose(2) },
      ],
      connections: [
        {
          id: 'a-b', kind: 'rigid' as const, fromPartId: 'a', toPartId: 'b',
          fromAnchor: { x: 0.5, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 },
        },
        {
          id: 'b-c', kind: 'rigid' as const, fromPartId: 'b', toPartId: 'c',
          fromAnchor: { x: 0.5, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 },
        },
      ],
    },
  };
}

describe('Rapier primitive adapter', () => {
  it('rotates world boxes, updates static world friction, and scopes applied force to one step', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const slope = physics.createBox({
      halfExtents: { x: 4, y: 0.1, z: 4 },
      position: { x: 0, y: 0, z: 0 },
      dynamic: false,
      rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
      friction: 0.2,
    });
    expect(physics.readPose(slope).rotation.z).toBeCloseTo(Math.SQRT1_2);
    physics.setBoxFriction(slope, 0.8);

    const body = physics.createBox({
      halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
      position: { x: 0, y: 5, z: 0 },
      dynamic: true,
    });
    physics.applyForce(body, { x: 8, y: 0, z: 0 });
    physics.step(0.1);
    const afterForce = physics.readLinearVelocity(body);
    expect(afterForce.x).toBeGreaterThan(0);
    physics.step(0.1);
    expect(physics.readLinearVelocity(body).x).toBeCloseTo(afterForce.x, 5);

    expect(() => physics.setBoxFriction(body, 0.4)).toThrow('Unknown static world box handle');
    expect(() => physics.setBoxFriction(slope, Number.NaN)).toThrow('non-negative and finite');
  });

  it('rejects invalid optional world box rotation and friction', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const base = { halfExtents: { x: 1, y: 1, z: 1 }, position: { x: 0, y: 0, z: 0 }, dynamic: false };
    expect(() => physics.createBox({ ...base, rotation: { x: 0, y: 0, z: 0, w: 0 } })).toThrow('non-zero');
    expect(() => physics.createBox({ ...base, friction: -1 })).toThrow('non-negative and finite');
  });

  it('changes sliding contact on the same rotated surface when friction changes', async () => {
    const slideDistance = async (friction: number) => {
      const physics = await RapierPhysicsAdapter.create();
      const angle = Math.PI / 6;
      const halfAngle = angle / 2;
      const normal = { x: -Math.sin(angle), y: Math.cos(angle), z: 0 };
      physics.createBox({
        halfExtents: { x: 10, y: 0.1, z: 4 },
        position: { x: 0, y: 0, z: 0 },
        dynamic: false,
        rotation: { x: 0, y: 0, z: Math.sin(halfAngle), w: Math.cos(halfAngle) },
        friction,
      });
      const body = physics.createBox({
        halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
        position: { x: normal.x * 0.32, y: normal.y * 0.32, z: 0 },
        dynamic: true,
        friction: 0.5,
      });
      const start = physics.readPose(body).position;
      for (let tick = 0; tick < 90; tick += 1) physics.step(1 / 60);
      const end = physics.readPose(body).position;
      return Math.hypot(end.x - start.x, end.y - start.y);
    };

    const lowFrictionSlide = await slideDistance(0.05);
    const highFrictionSlide = await slideDistance(1.5);
    expect(lowFrictionSlide).toBeGreaterThan(highFrictionSlide + 0.5);
  });

  it('lets gravity and collision decide the smoke body pose', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 8, y: 0.1, z: 8 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    const body = physics.createBox({ halfExtents: { x: 0.5, y: 0.5, z: 0.5 }, position: { x: 0, y: 4, z: 0 }, dynamic: true });
    for (let tick = 0; tick < 120; tick++) physics.step(1 / 60);
    expect(physics.readPose(body).position.y).toBeCloseTo(0.5, 1);
  });

  it('removes selected Parts and incident live or broken joints while survivors keep stepping', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(threePartEntity());
    const removedHandle = body.partHandles.get('b')!;

    physics.breakConnection(body, 'a-b');
    expect(body.connectionHandles.has('a-b')).toBe(false);
    physics.removeParts(body, ['b']);

    expect(body.partHandles.has('b')).toBe(false);
    expect(body.partHandles.has('a')).toBe(true);
    expect(body.partHandles.has('c')).toBe(true);
    expect(body.connectionHandles.size).toBe(0);
    expect(() => body.readPartPose('b')).toThrow('Unknown part id: b');
    expect(() => physics.readPose(removedHandle)).toThrow(`Unknown body handle: ${removedHandle}`);
    expect(() => physics.readJointPosition(body, 'a-b')).toThrow('Unknown connection id: a-b');

    physics.step(1 / 60);
    expect(Number.isFinite(body.readPartPose('a').position.y)).toBe(true);
    expect(Number.isFinite(body.readPartPose('c').position.y)).toBe(true);
  });

  it('reconstructs edited structure while preserving surviving world state and filtering active connections', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const original = threePartEntity();
    const body = physics.createBody(original);
    const originalAHandle = body.partHandles.get('a')!;
    const originalAPose = body.readPartPose('a');

    physics.applyImpulse(originalAHandle, { x: 3, y: 0, z: -1 });
    physics.applyTorqueImpulse(originalAHandle, { x: 0, y: 2, z: 0 });
    const originalLinearVelocity = physics.readLinearVelocity(originalAHandle);
    const originalAngularVelocity = physics.readPartAngularVelocity(body, 'a');

    const newPart = {
      id: 'new',
      materialId: 'material',
      geometry: { kind: 'box' as const, halfExtents: { x: 0.25, y: 0.25, z: 0.25 } },
      pose: {
        position: { x: 5, y: 4, z: -2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    };
    const revised = {
      ...original,
      blueprint: {
        ...original.blueprint,
        parts: [original.blueprint.parts[0], original.blueprint.parts[2], newPart],
        connections: [],
      },
    };

    const replacement = physics.reconstructBody(body, revised, {
      origin: { x: 20, y: 1, z: 3 },
      activeConnectionIds: [],
    });

    const replacementAHandle = replacement.partHandles.get('a')!;
    const replacementAPose = replacement.readPartPose('a');
    expect(replacementAPose.position.x).toBeCloseTo(originalAPose.position.x);
    expect(replacementAPose.position.y).toBeCloseTo(originalAPose.position.y);
    expect(replacementAPose.position.z).toBeCloseTo(originalAPose.position.z);
    expect(replacementAPose.rotation).toEqual(originalAPose.rotation);
    expect(physics.readLinearVelocity(replacementAHandle).x).toBeCloseTo(originalLinearVelocity.x);
    expect(physics.readLinearVelocity(replacementAHandle).y).toBeCloseTo(originalLinearVelocity.y);
    expect(physics.readLinearVelocity(replacementAHandle).z).toBeCloseTo(originalLinearVelocity.z);
    const replacementAngularVelocity = physics.readPartAngularVelocity(replacement, 'a');
    expect(replacementAngularVelocity.x).toBeCloseTo(originalAngularVelocity.x);
    expect(replacementAngularVelocity.y).toBeCloseTo(originalAngularVelocity.y);
    expect(replacementAngularVelocity.z).toBeCloseTo(originalAngularVelocity.z);

    const newPose = replacement.readPartPose('new');
    expect(newPose.position.x).toBeCloseTo(25);
    expect(newPose.position.y).toBeCloseTo(5);
    expect(newPose.position.z).toBeCloseTo(1);
    expect(replacement.connectionHandles.size).toBe(0);
    expect(body.partHandles.size).toBe(0);
    expect(() => physics.readPose(originalAHandle)).toThrow(`Unknown body handle: ${originalAHandle}`);

    physics.removeBody(replacement);
  });

  it('keeps the old body intact when revised Blueprint validation fails', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(threePartEntity());
    const poseBefore = body.readPartPose('a');
    const invalid = {
      ...threePartEntity(),
      blueprint: {
        ...threePartEntity().blueprint,
        parts: threePartEntity().blueprint.parts.map((part) => part.id === 'a'
          ? { ...part, geometry: { ...part.geometry, halfExtents: { x: 0, y: 0.5, z: 0.5 } } }
          : part),
      },
    };

    expect(() => physics.reconstructBody(body, invalid)).toThrow('Invalid geometry: a');
    expect(body.partHandles.size).toBe(3);
    expect(body.readPartPose('a').position).toEqual(poseBefore.position);
    physics.removeBody(body);
  });

  it('removes all Parts, joints, and backend references for a runtime body', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(threePartEntity());
    const handles = [...body.partHandles.values()];

    physics.removeBody(body);

    expect(body.partHandles.size).toBe(0);
    expect(body.connectionHandles.size).toBe(0);
    expect(() => physics.readPartImpactImpulse(body, 'a')).toThrow('Unknown physics body');
    for (const handle of handles) expect(() => physics.readPose(handle)).toThrow(`Unknown body handle: ${handle}`);
    physics.step(1 / 60);
  });
});
