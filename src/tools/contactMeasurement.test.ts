import { expect, it } from 'vitest';
import type { ContactPatch } from '../core/contact';
import { hasSimultaneousContact } from './contactMeasurement';

const sample = (offset: number): ContactPatch => ({
  point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 },
  forceN: 1, impulseNs: 0.01, effectiveAreaM2: 0.001, pressurePa: 1000,
  seconds: 0.01, sampleOffsetSeconds: offset,
});

it('excludes alternating unilateral substeps from bilateral gripping evidence', () => {
  expect(hasSimultaneousContact([sample(0)], [sample(0.01)])).toBe(false);
  expect(hasSimultaneousContact([sample(0), sample(0.02)], [sample(0.01)])).toBe(false);
  expect(hasSimultaneousContact([sample(0)], [sample(0)])).toBe(true);
  expect(hasSimultaneousContact([sample(0), sample(0.02)], [sample(0.02)])).toBe(true);
  expect(hasSimultaneousContact([], [sample(0)])).toBe(false);
});
