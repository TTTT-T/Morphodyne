import { describe, expect, it } from 'vitest';
import type { WorldRuntime } from '../simulation/WorldRuntime';
import { LeopardTractionInstrument } from './LeopardTraction';

describe('LeopardTractionInstrument observer diagnostics', () => {
  it('records material-point slip, touchdown windows, stance phases, rates, and weighted anchoring', () => {
    let tick = -1;
    const pawId = 'leopard-front-left-paw';
    const world = {
      readPartPose: (_entityId: string, partId: string) => {
        const torsoX = Math.max(0, tick) * 0.1;
        if (partId === 'leopard-chest') return { position: { x: torsoX, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
        return { position: { x: tick >= 3 ? (tick - 3) * 0.01 : 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
      },
      readPartVelocity: () => ({ x: 0.6, y: 0, z: 0 }),
      readPartContacts: () => tick >= 3 && tick <= 11
        ? [{ point: { x: (tick - 3) * 0.01, y: 0, z: 0 }, impulseNs: 0.2 }]
        : [],
      readSensorRuntime: () => ({ readObservations: () => [
        { channel: 'joint', ownConnectionId: 'leopard-front-left-hip-joint', values: [0.1, 1, 0.2, 2, 0.3, 3] },
        { channel: 'joint', ownConnectionId: 'leopard-front-left-knee-joint', values: [0.4, 4] },
        { channel: 'joint', ownConnectionId: 'leopard-front-left-paw', values: [0.5, 5] },
      ] }),
    } as unknown as WorldRuntime;
    const instrument = new LeopardTractionInstrument([pawId]);
    for (tick = 0; tick <= 12; tick += 1) instrument.record(world, 'subject', 1 / 60);

    const result = instrument.summary();
    const episode = result.episodes[0];
    expect(episode.stanceTicks).toBe(9);
    expect(episode.stanceDurationSeconds).toBeCloseTo(0.15);
    expect(episode.totalMaterialPointSlip).toBeCloseTo(0.08);
    expect(episode.netMaterialPointDisplacement).toBeCloseTo(0.09);
    expect(episode.torsoTravel).toBeCloseTo(0.9);
    expect(episode.anchoringEfficiency).toBeCloseTo(1 - 0.08 / 0.9);
    expect(episode.contactImpulseNs).toBeCloseTo(1.8);
    expect(episode.preTouchdown.samples.map((sample) => sample.tickOffset)).toEqual([-3, -2, -1]);
    expect(episode.postTouchdown[3].samples.map((sample) => sample.tickOffset)).toEqual([0, 1, 2, 3]);
    expect(episode.postTouchdown[6].samples).toHaveLength(7);
    expect(episode.postTouchdown[12].samples).toHaveLength(9);
    expect(episode.early.samples.length).toBeGreaterThan(0);
    expect(episode.mid.samples.length).toBeGreaterThan(0);
    expect(episode.late.samples.length).toBeGreaterThan(0);
    expect(episode.early.meanHipRate).toEqual({ x: 2, y: 3, z: 1 });
    expect(episode.early.meanKneeRate).toBe(4);
    expect(episode.early.meanAnkleRate).toBe(5);
    expect(result.anchoring.weightedMean).toBeCloseTo(1 - 0.08 / 0.9);
    expect(result.anchoring.median).toBeCloseTo(1 - 0.08 / 0.9);
    expect(result.anchoring.p75).toBeCloseTo(1 - 0.08 / 0.9);
    expect(result.anchoring.p90).toBeCloseTo(1 - 0.08 / 0.9);
    expect(result.sustainedStanceSlipRatio).toBeCloseTo(0.1);
  });

  it('excludes zero-travel episodes from anchoring quantiles instead of counting them as perfect', () => {
    let tick = -1;
    const world = {
      readPartPose: () => ({ position: { x: 0, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }),
      readPartVelocity: () => ({ x: 0, y: 0, z: 0 }),
      readPartContacts: () => tick >= 1 && tick <= 10 ? [{ point: { x: 0, y: 0, z: 0 }, impulseNs: 0 }] : [],
      readSensorRuntime: () => undefined,
    } as unknown as WorldRuntime;
    const instrument = new LeopardTractionInstrument(['leopard-front-left-paw']);
    for (tick = 0; tick <= 11; tick += 1) instrument.record(world, 'subject', 1 / 60);
    expect(instrument.summary().anchoring).toEqual({ weightedMean: null, median: null, p75: null, p90: null,
      episodeCount: 0, excludedZeroTravelEpisodes: 1 });
  });

  it('includes the still-grounded final episode without mutating subsequent summaries', () => {
    let tick = -1;
    const world = {
      readPartPose: (_entityId: string, partId: string) => ({
        position: { x: partId === 'leopard-chest' ? tick * 0.1 : 0, y: 0.1, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      }),
      readPartVelocity: () => ({ x: 0, y: 0, z: 0 }),
      readPartContacts: () => [{ point: { x: 0, y: 0, z: 0 }, impulseNs: 1 }],
      readSensorRuntime: () => undefined,
    } as unknown as WorldRuntime;
    const instrument = new LeopardTractionInstrument(['leopard-front-left-paw']);
    for (tick = 0; tick < 10; tick += 1) instrument.record(world, 'subject', 1 / 60);
    expect(instrument.summary().episodes).toHaveLength(1);
    expect(instrument.summary().paws[0].sustainedEpisodes).toBe(1);
    expect(instrument.summary().episodes[0].stanceTicks).toBe(10);
  });
  it('counts completed physical swings instead of grounded mode changes or contact flicker', () => {
    let tick = 0;
    const contacts = [true, false, true, false, false, false, true];
    const heights = [0.07, 0.08, 0.07, 0.08, 0.20, 0.12, 0.07];
    const world = {
      readBlueprint: () => ({ parts: [{ id: 'leopard-front-left-paw', geometry: { kind: 'box', halfExtents: { x: 0.14, y: 0.07, z: 0.14 } } }] }),
      readPartPose: (_entityId: string, partId: string) => ({
        position: { x: tick * 0.1, y: partId === 'leopard-chest' ? 1 : heights[tick], z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      }),
      readPartVelocity: () => ({ x: 0, y: 0, z: 0 }),
      readPartContacts: () => contacts[tick] ? [{ point: { x: tick * 0.1, y: 0, z: 0 }, impulseNs: 1 }] : [],
      readSensorRuntime: () => undefined,
    } as unknown as WorldRuntime;
    const instrument = new LeopardTractionInstrument(['leopard-front-left-paw']);
    for (tick = 0; tick < contacts.length; tick += 1) instrument.record(world, 'subject', 1 / 60);
    expect(instrument.summary().paws[0].effectiveSwingCount).toBe(1);
    expect(instrument.summary().paws[0].meanSwingLift).toBeCloseTo(0.13);
    expect(instrument.summary().paws[0].meanSwingSoleClearance).toBeCloseTo(0.13);
  });

  it('requires the whole tilted box to clear the floor rather than just its center', () => {
    let tick = 0;
    const world = {
      readBlueprint: () => ({ parts: [{ id: 'paw', geometry: { kind: 'box',
        halfExtents: { x: 0.14, y: 0.07, z: 0.14 } } }] }),
      readPartPose: (_entityId: string, partId: string) => ({
        position: { x: 0, y: partId === 'leopard-chest' ? 1 : tick === 0 || tick === 4 ? 0.07 : 0.18, z: 0 },
        rotation: partId !== 'leopard-chest' && tick > 0 && tick < 4
          ? { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } : { x: 0, y: 0, z: 0, w: 1 },
      }),
      readPartVelocity: () => ({ x: 0, y: 0, z: 0 }),
      readPartContacts: () => tick === 0 || tick === 4 ? [{ point: { x: 0, y: 0, z: 0 }, impulseNs: 1 }] : [],
      readSensorRuntime: () => undefined,
    } as unknown as WorldRuntime;
    const instrument = new LeopardTractionInstrument(['paw']);
    for (tick = 0; tick < 5; tick += 1) instrument.record(world, 'subject', 1 / 60);
    // The center rises 0.11 m, but the rotated collider bottom clears only 0.04 m.
    expect(instrument.summary().paws[0].effectiveSwingCount).toBe(0);
  });

  it('recognizes sole lift when a previously tilted grounded paw levels in the air', () => {
    let tick = 0;
    const grounded = Math.sin(Math.PI/6)*0.14 + Math.cos(Math.PI/6)*0.07;
    const world = {
      readBlueprint: () => ({ parts: [{ id: 'paw', geometry: { kind: 'box',
        halfExtents: { x: 0.14, y: 0.07, z: 0.14 } } }] }),
      readPartPose: (_entityId: string, partId: string) => ({
        position: { x: 0, y: partId === 'leopard-chest' ? 1 : tick === 0 || tick === 4 ? grounded : 0.18, z: 0 },
        rotation: partId !== 'leopard-chest' && (tick === 0 || tick === 4)
          ? { x: 0, y: 0, z: Math.sin(Math.PI/12), w: Math.cos(Math.PI/12) } : { x: 0, y: 0, z: 0, w: 1 },
      }),
      readPartVelocity: () => ({ x: 0, y: 0, z: 0 }),
      readPartContacts: () => tick === 0 || tick === 4 ? [{ point: { x: 0, y: 0, z: 0 }, impulseNs: 1 }] : [],
      readSensorRuntime: () => undefined,
    } as unknown as WorldRuntime;
    const instrument = new LeopardTractionInstrument(['paw']);
    for (tick = 0; tick < 5; tick += 1) instrument.record(world, 'subject', 1 / 60);
    const result = instrument.summary().paws[0];
    expect(result.meanSwingLift).toBeLessThan(0.05);
    expect(result.meanSwingSoleClearance).toBeCloseTo(0.11);
    expect(result.effectiveSwingCount).toBe(1);
  });

  it('uses integrated tick contact impulses rather than final-substep point impulses', () => {
    let tick = 0;
    const world = {
      readPartPose: () => ({ position: { x: tick * 0.1, y: 0.1, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 } }),
      readPartVelocity: () => ({ x: 0, y: 0, z: 0 }),
      readPartContacts: () => [{ point: { x: tick * 0.1, y: 0, z: 0 }, impulseNs: 0.1 }],
      readPartContactLoad: () => ({ impulseNs: 0.4, forceN: 24 }),
      readSensorRuntime: () => undefined,
    } as unknown as WorldRuntime;
    const instrument = new LeopardTractionInstrument(['leopard-front-left-paw']);
    for (tick = 0; tick < 3; tick += 1) instrument.record(world, 'subject', 1 / 60);
    expect(instrument.summary().episodes[0].contactImpulseNs).toBeCloseTo(1.2);
  });

});
