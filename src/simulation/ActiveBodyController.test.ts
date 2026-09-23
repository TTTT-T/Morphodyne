import { describe, expect, it } from 'vitest';
import type { Pose } from '../core/model';
import {
  ActiveBodyController,
  expandActuatorGroups,
  type ActuatorChannel,
  type ControllerFeedback,
} from './ActiveBodyController';

const identityPose: Pose = {
  position: { x: 0, y: 1.8, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

const channels: readonly ActuatorChannel[] = [
  { actuatorId: 'a0', x: -1, z: -1, phase: 0 },
  { actuatorId: 'a1', x: -1, z: 1, phase: Math.PI },
  { actuatorId: 'a2', x: 1, z: -1, phase: Math.PI },
  { actuatorId: 'a3', x: 1, z: 1, phase: 0 },
];

describe('active body controller', () => {
  it('expands caller supplied actuator groups without semantic part roles', () => {
    const expanded = expandActuatorGroups([
      { actuatorIds: ['first', 'second'], x: -0.8, z: 0.5, phaseOffsets: [0, Math.PI] },
    ]);
    expect(expanded).toEqual([
      { actuatorId: 'first', x: -0.8, z: 0.5, phase: 0, neutralAngle: undefined, motionGain: undefined },
      { actuatorId: 'second', x: -0.8, z: 0.5, phase: Math.PI, neutralAngle: undefined, motionGain: undefined },
    ]);
  });

  it('emits normalized, phase differentiated signals for forward and turn intent', () => {
    const controller = new ActiveBodyController(channels, { cycleFrequencyHz: 1 });
    const poseBefore = structuredClone(identityPose);
    const signals = controller.update(1 / 8, identityPose, { forward: 1, turn: 0.4 });

    expect(signals.map(({ actuatorId }) => actuatorId)).toEqual(['a0', 'a1', 'a2', 'a3']);
    expect(signals.every(({ value }) => value >= -1 && value <= 1)).toBe(true);
    expect(new Set(signals.map(({ value }) => value)).size).toBeGreaterThan(1);
    expect(identityPose).toEqual(poseBefore);

    const turnOnly = controller.update(0, identityPose, { forward: 0, turn: 1 });
    expect(turnOnly.some(({ value }) => Math.abs(value) > 0.01)).toBe(true);
    expect(turnOnly.map(({ value }) => value)).not.toEqual(signals.map(({ value }) => value));
  });

  it('keeps the standing signal closed-loop and separate from oscillation', () => {
    const controller = new ActiveBodyController(channels, {
      standingGain: 1,
      standingDampingGain: 0.1,
      jointPositionGain: 0.75,
      jointVelocityGain: 0.25,
      motionGain: 0.9,
    });
    const feedback: ControllerFeedback = {
      joints: new Map([
        ['a0', { angle: 0.2, angularVelocity: 0.4 }],
        ['a1', { angle: -0.2, angularVelocity: -0.4 }],
      ]),
    };
    const posture = controller.update(0, identityPose, { forward: 0, turn: 0 }, feedback);
    const neutral = controller.update(0, identityPose, { forward: 0, turn: 0 });

    expect(posture[0].value).not.toBe(neutral[0].value);
    expect(posture[1].value).not.toBe(neutral[1].value);
    expect(posture[2].value).toBeCloseTo(0, 6);
    expect(posture[3].value).toBeCloseTo(0, 6);

    const tilted = controller.update(0, {
      ...identityPose,
      rotation: { x: 0, y: 0, z: Math.sin(Math.PI / 16), w: Math.cos(Math.PI / 16) },
    }, { forward: 0, turn: 0 });
    expect(tilted[0].value).toBeCloseTo(-tilted[2].value, 6);
    expect(tilted[1].value).toBeCloseTo(-tilted[3].value, 6);
  });

  it('clamps intent and rejects invalid channels while never writing a pose', () => {
    const controller = new ActiveBodyController([{ actuatorId: 'a', x: 0, z: 1, phase: 0 }]);
    expect(controller.update(0, identityPose, { forward: 4, turn: -4 })[0].value).toBeGreaterThanOrEqual(-1);
    expect(controller.update(0, identityPose, { forward: 4, turn: -4 })[0].value).toBeLessThanOrEqual(1);
    expect(() => new ActiveBodyController([
      { actuatorId: 'a', x: 0, z: 0, phase: Number.NaN },
    ])).toThrow(/phase/);
    expect(() => controller.update(0, identityPose, { forward: Number.NaN, turn: 0 })).toThrow(/forward/);
  });
});
