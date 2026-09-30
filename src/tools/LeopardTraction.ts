import type { Quaternion, Vector3 } from '../core/model';
import type { WorldRuntime } from '../simulation/WorldRuntime';

export interface TractionJointRates {
  readonly hip: Vector3;
  readonly knee: number;
  readonly ankle: number;
}

export interface TractionSample {
  /** Tick offset from touchdown; negative values are pre-touchdown. */
  readonly tickOffset: number;
  readonly materialPointSpeed: number;
  readonly materialPointPosition: { readonly x: number; readonly z: number };
  readonly torsoSpeed: number;
  readonly torsoPosition: { readonly x: number; readonly z: number };
  readonly jointRates: TractionJointRates;
  readonly contactImpulseNs: number;
}

export interface TractionWindow {
  readonly samples: readonly TractionSample[];
  readonly materialPointSlip: number;
  readonly meanMaterialPointSpeed: number;
  readonly meanTorsoSpeed: number;
  readonly meanHipRate: Vector3;
  readonly meanKneeRate: number;
  readonly meanAnkleRate: number;
  readonly contactImpulseNs: number;
}

export interface TractionEpisode {
  readonly pawId: string;
  readonly touchdownTick: number;
  readonly stanceTicks: number;
  readonly stanceDurationSeconds: number;
  /** Sum of per-tick horizontal travel of the touchdown-anchored paw material point. */
  readonly totalMaterialPointSlip: number;
  /** Net touchdown-to-liftoff material-point displacement, kept for comparison only. */
  readonly netMaterialPointDisplacement: number;
  /** Net horizontal torso displacement from touchdown to liftoff. */
  readonly torsoTravel: number;
  /** Sum of per-tick torso travel while in contact. */
  readonly torsoPathLength: number;
  readonly contactImpulseNs: number;
  readonly anchoringEfficiency: number | null;
  readonly preTouchdown: TractionWindow;
  readonly postTouchdown: Readonly<Record<3 | 6 | 12, TractionWindow>>;
  readonly early: TractionWindow;
  readonly mid: TractionWindow;
  readonly late: TractionWindow;
}

export interface AnchoringStats {
  readonly weightedMean: number | null;
  readonly median: number | null;
  readonly p75: number | null;
  readonly p90: number | null;
  readonly episodeCount: number;
  readonly excludedZeroTravelEpisodes: number;
}

export interface PawTractionSummary {
  readonly pawId: string;
  readonly contactTicks: number;
  readonly airborneTicks: number;
  readonly dutyFactor: number;
  readonly contactLosses: number;
  readonly stanceEpisodes: number;
  readonly meanEpisodeSeconds: number;
  readonly meanStrideLength: number;
  /** Mean touchdown-to-liftoff net material-point displacement (legacy endpoint metric). */
  readonly meanStancePawSlip: number;
  /** Mean per-tick accumulated material-point path length. */
  readonly meanStanceMaterialPointAccumulatedSlip: number;
  /** Mean touchdown-to-liftoff net torso displacement (legacy denominator). */
  readonly meanStanceTorsoTravel: number;
  readonly meanStancePawSpeed: number;
  /** Legacy absolute airborne paw-center height; retained for old reports. */
  readonly meanSwingClearance: number;
  /** Completed airborne intervals >= 0.05 s whose entire box clears the floor by > 0.05 m. */
  readonly effectiveSwingCount: number;
  readonly meanSwingLift: number;
  readonly meanSwingSoleClearance: number;
  /** Mean net endpoint material-point displacement over episodes lasting at least 0.15 s. */
  readonly sustainedEpisodeSlip: number;
  /** Mean accumulated material-point path length over the same episodes. */
  readonly sustainedAccumulatedEpisodeSlip: number;
  /** Mean torso travel for the same >=0.15 s episodes. */
  readonly sustainedEpisodeTravel: number;
  readonly sustainedEpisodes: number;
  readonly episodes: readonly TractionEpisode[];
  readonly anchoring: AnchoringStats;
  readonly sustainedAnchoring: AnchoringStats;
}

export interface TractionSummary {
  readonly paws: readonly PawTractionSummary[];
  readonly episodes: readonly TractionEpisode[];
  readonly anchoring: AnchoringStats;
  readonly sustainedAnchoring: AnchoringStats;
  /** Legacy endpoint slip / net torso displacement ratio, kept comparable to prior runs. */
  readonly stanceSlipRatio: number;
  /** Legacy endpoint slip / net torso displacement over episodes >=0.15 s. */
  readonly sustainedStanceSlipRatio: number;
  /** Same >=0.15 s episode selection, using accumulated material-point path length. */
  readonly sustainedAccumulatedStanceSlipRatio: number;
  /** Whole-run accumulated material-point slip / torso travel. */
  readonly accumulatedStanceSlipRatio: number;
  readonly cumulativeSlipRatio: number;
  readonly sustainedCumulativeSlipRatio: number;
  readonly torsoPathLength: number;
  readonly torsoMeanSpeed: number;
  readonly recordedSeconds: number;
}

interface PoseSnapshot {
  readonly tick: number;
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly torso: Vector3;
  readonly joints: TractionJointRates;
}

interface EpisodeBuilder {
  readonly touchdownTick: number;
  readonly touchdownLocal: Vector3;
  readonly preTouchdownSnapshots: readonly PoseSnapshot[];
  readonly touchdownWorld: { x: number; z: number };
  readonly touchdownTorso: { x: number; z: number };
  readonly snapshots: PoseSnapshot[];
  readonly impulses: Map<number, number>;
  previousMaterialPoint: { x: number; z: number };
  previousTorso: { x: number; z: number };
  accumulatedSlip: number;
  torsoPathLength: number;
  contactImpulseNs: number;
}

interface PawAccumulator {
  contactTicks: number;
  airborneTicks: number;
  contactLosses: number;
  episodes: TractionEpisode[];
  inEpisode: EpisodeBuilder | null;
  lastTouchdown: { x: number; z: number } | null;
  strideTotal: number;
  stanceSpeedIntegral: number;
  stanceSpeedSeconds: number;
  swingHeightIntegral: number;
  lastGroundedCenterY: number | null;
  swing: { ticks: number; maxLift: number; maxClearance: number } | null;
  completedSwingLifts: number[];
  completedSwingClearances: number[];
}

function rotateVector(q: Quaternion, v: Vector3): Vector3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return { x: v.x + q.w * tx + q.y * tz - q.z * ty,
    y: v.y + q.w * ty + q.z * tx - q.x * tz,
    z: v.z + q.w * tz + q.x * ty - q.y * tx };
}

const horizontalDistance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

const emptyWindow = (): TractionWindow => ({ samples: [], materialPointSlip: 0, meanMaterialPointSpeed: 0,
  meanTorsoSpeed: 0, meanHipRate: { x: 0, y: 0, z: 0 }, meanKneeRate: 0, meanAnkleRate: 0, contactImpulseNs: 0 });

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function anchoringStats(episodes: readonly TractionEpisode[]): AnchoringStats {
  const valid = episodes.filter((episode) => episode.anchoringEfficiency !== null);
  const weight = valid.reduce((sum, episode) => sum + episode.torsoTravel, 0);
  return {
    weightedMean: weight > 1e-9
      ? valid.reduce((sum, episode) => sum + episode.anchoringEfficiency! * episode.torsoTravel, 0) / weight
      : null,
    median: percentile(valid.map((episode) => episode.anchoringEfficiency!), 0.5),
    p75: percentile(valid.map((episode) => episode.anchoringEfficiency!), 0.75),
    p90: percentile(valid.map((episode) => episode.anchoringEfficiency!), 0.9),
    episodeCount: valid.length,
    excludedZeroTravelEpisodes: episodes.length - valid.length,
  };
}

function materialPoint(snapshot: PoseSnapshot, local: Vector3): { x: number; z: number } {
  const offset = rotateVector(snapshot.rotation, local);
  return { x: snapshot.position.x + offset.x, z: snapshot.position.z + offset.z };
}

/** Observer-side instrument: it measures world state and never feeds the Agent. */
export class LeopardTractionInstrument {
  private readonly paws = new Map<string, PawAccumulator>();
  private recordedTicks = 0;
  private torsoPath = 0;
  private lastTorso: { x: number; z: number } | null = null;
  private tick = 0;
  private secondsPerTick = 1 / 60;

  constructor(private readonly pawIds: readonly string[], private readonly torsoPartId = 'leopard-chest',
    private readonly floorHeight = 0) {}

  record(world: WorldRuntime, entityId: string, secondsPerTick: number): void {
    this.secondsPerTick = secondsPerTick;
    const torso = world.readPartPose(entityId, this.torsoPartId).position;
    const torsoPoint = { x: torso.x, z: torso.z };
    if (this.lastTorso) this.torsoPath += horizontalDistance(torsoPoint, this.lastTorso);
    this.lastTorso = torsoPoint;
    const geometry = new Map(world.readBlueprint?.(entityId).parts.map(part => [part.id, part.geometry]) ?? []);
    const observations = world.readSensorRuntime(entityId)?.readObservations() ?? [];
    for (const pawId of this.pawIds) {
      let paw = this.paws.get(pawId);
      if (!paw) {
        paw = { contactTicks: 0, airborneTicks: 0, contactLosses: 0, episodes: [], inEpisode: null,
          lastTouchdown: null, strideTotal: 0, stanceSpeedIntegral: 0, stanceSpeedSeconds: 0, swingHeightIntegral: 0, lastGroundedCenterY: null, swing: null, completedSwingLifts: [], completedSwingClearances: [] };
        this.paws.set(pawId, paw);
      }
      const pose = world.readPartPose(entityId, pawId);
      const velocity = world.readPartVelocity(entityId, pawId) ?? { x: 0, y: 0, z: 0 };
      const contacts = world.readPartContacts(entityId, pawId).filter((contact) => contact.otherEntityId === undefined);
      const touching = contacts.length > 0;
      // Per-point impulses are final-substep snapshots. Use the world's
      // integrated whole-tick Part contact load for the diagnostic force proxy.
      const contactImpulseNs = world.readPartContactLoad?.(entityId, pawId)?.impulseNs
        ?? contacts.reduce((sum, item) => sum + item.impulseNs, 0);
      const legPrefix = pawId.replace(/-paw$/, '');
      const readRates = (jointId: string, offset: number): number[] => {
        const reading = observations.find((item) => item.channel === 'joint' && item.ownConnectionId === jointId)?.values;
        return reading ? [reading[offset] ?? 0, reading[offset + 2] ?? 0, reading[offset + 4] ?? 0] : [];
      };
      const hipValues = readRates(`${legPrefix}-hip-joint`, 1);
      const kneeValues = readRates(`${legPrefix}-knee-joint`, 1);
      const ankleValues = readRates(`${legPrefix}-paw`, 1);
      const joints: TractionJointRates = {
        // Spherical sensor order is Z, X, Y; expose the rates in world-local XYZ order.
        hip: { x: hipValues[1] ?? 0, y: hipValues[2] ?? 0, z: hipValues[0] ?? 0 },
        knee: kneeValues[0] ?? 0,
        ankle: ankleValues[0] ?? 0,
      };
      const snapshot: PoseSnapshot = { tick: this.tick, position: pose.position, rotation: pose.rotation,
        torso, joints };
      if (touching) {
        if (paw.swing && paw.swing.ticks * secondsPerTick >= 0.05 - 1e-9 && paw.swing.maxClearance > 0.05) {
          paw.completedSwingLifts.push(paw.swing.maxLift);
          paw.completedSwingClearances.push(paw.swing.maxClearance);
        }
        paw.swing = null;
        paw.lastGroundedCenterY = pose.position.y;
        paw.contactTicks += 1;
        paw.stanceSpeedIntegral += Math.hypot(velocity.x, velocity.z) * secondsPerTick;
        paw.stanceSpeedSeconds += secondsPerTick;
        if (!paw.inEpisode) {
          const contact = contacts.reduce((best, candidate) => candidate.impulseNs > best.impulseNs ? candidate : best);
          const inverse = { x: -pose.rotation.x, y: -pose.rotation.y, z: -pose.rotation.z, w: pose.rotation.w };
          const local = rotateVector(inverse, { x: contact.point.x - pose.position.x,
            y: contact.point.y - pose.position.y, z: contact.point.z - pose.position.z });
          const pawPoint = { x: pose.position.x, z: pose.position.z };
          if (paw.lastTouchdown) paw.strideTotal += horizontalDistance(pawPoint, paw.lastTouchdown);
          paw.lastTouchdown = pawPoint;
          const projectedHistory = this.history.get(pawId) ?? [];
          const touchMaterial = materialPoint(snapshot, local);
          const builder: EpisodeBuilder = { touchdownTick: this.tick, touchdownLocal: local,
            preTouchdownSnapshots: projectedHistory.filter((item) => item.tick >= this.tick - 3),
            touchdownWorld: { x: contact.point.x, z: contact.point.z }, touchdownTorso: torsoPoint,
            snapshots: [snapshot], impulses: new Map([[this.tick, contactImpulseNs]]),
            previousMaterialPoint: touchMaterial, previousTorso: torsoPoint, accumulatedSlip: 0, torsoPathLength: 0,
            contactImpulseNs };
          paw.inEpisode = builder;
        } else {
          const builder = paw.inEpisode;
          const point = materialPoint(snapshot, builder.touchdownLocal);
          const stepSlip = horizontalDistance(point, builder.previousMaterialPoint);
          builder.accumulatedSlip += stepSlip;
          builder.torsoPathLength += horizontalDistance(torsoPoint, builder.previousTorso);
          builder.previousMaterialPoint = point;
          builder.previousTorso = torsoPoint;
          builder.snapshots.push(snapshot);
          const impulse = contactImpulseNs;
          builder.impulses.set(this.tick, impulse);
          builder.contactImpulseNs += impulse;
        }
      } else {
        paw.airborneTicks += 1;
        if (paw.lastGroundedCenterY !== null) {
          paw.swing ??= { ticks: 0, maxLift: 0, maxClearance: -Infinity };
          paw.swing.ticks += 1;
          paw.swing.maxLift = Math.max(paw.swing.maxLift, pose.position.y - paw.lastGroundedCenterY);
          const shape = geometry.get(pawId);
          if (shape?.kind === 'box') {
            const q = pose.rotation, half = shape.halfExtents;
            const radius = Math.abs(2*(q.x*q.y + q.w*q.z))*half.x
              + Math.abs(1-2*(q.x*q.x+q.z*q.z))*half.y
              + Math.abs(2*(q.y*q.z-q.w*q.x))*half.z;
            paw.swing.maxClearance = Math.max(paw.swing.maxClearance, pose.position.y-radius-this.floorHeight);
          }
        }
        paw.swingHeightIntegral += pose.position.y * secondsPerTick;
        if (paw.inEpisode) {
          paw.contactLosses += 1;
          paw.episodes.push(this.finishEpisode(pawId, paw.inEpisode, snapshot));
          paw.inEpisode = null;
        }
      }
      const history = this.history.get(pawId) ?? [];
      history.push(snapshot);
      if (history.length > 16) history.shift();
      this.history.set(pawId, history);
    }
    this.recordedTicks += 1;
    this.tick += 1;
  }

  private readonly history = new Map<string, PoseSnapshot[]>();

  private finishEpisode(pawId: string, builder: EpisodeBuilder, liftoff?: PoseSnapshot): TractionEpisode {
    const durationTicks = builder.snapshots.length;
    const touchdownLocal = builder.touchdownLocal;
    const snapshots = [...builder.preTouchdownSnapshots, ...builder.snapshots]
      .sort((a, b) => a.tick - b.tick);
    const samples: TractionSample[] = snapshots.map((snapshot, index) => {
      const point = materialPoint(snapshot, touchdownLocal);
      const previous = index > 0 ? materialPoint(snapshots[index - 1], touchdownLocal) : point;
      const previousTorso = index > 0 ? snapshots[index - 1].torso : snapshot.torso;
      const dt = this.secondsPerTick * Math.max(1, snapshot.tick - (index > 0 ? snapshots[index - 1].tick : snapshot.tick));
      return { tickOffset: snapshot.tick - builder.touchdownTick,
        materialPointSpeed: horizontalDistance(point, previous) / dt,
        materialPointPosition: point, torsoSpeed: horizontalDistance(snapshot.torso, previousTorso) / dt,
        torsoPosition: { x: snapshot.torso.x, z: snapshot.torso.z }, jointRates: snapshot.joints,
        contactImpulseNs: builder.impulses.get(snapshot.tick) ?? 0 };
    });
    const pre = samples.filter((sample) => sample.tickOffset >= -3 && sample.tickOffset < 0);
    const post = (count: 3 | 6 | 12) => samples.filter((sample) => sample.tickOffset >= 0 && sample.tickOffset <= count);
    const phase = (start: number, end: number) => samples.filter((sample) => sample.tickOffset >= 0
      && sample.tickOffset < durationTicks && sample.tickOffset / Math.max(1, durationTicks) >= start
      && sample.tickOffset / Math.max(1, durationTicks) < end);
    const toWindow = (selected: readonly TractionSample[]): TractionWindow => this.window(selected);
    const endpoint = liftoff ? materialPoint(liftoff, touchdownLocal) : builder.previousMaterialPoint;
    const torsoEndpoint = liftoff?.torso ?? builder.previousTorso;
    const torsoTravel = horizontalDistance(torsoEndpoint, builder.touchdownTorso);
    const efficiency = torsoTravel > 1e-9
      ? Math.max(0, 1 - builder.accumulatedSlip / torsoTravel) : null;
    return { pawId, touchdownTick: builder.touchdownTick, stanceTicks: durationTicks,
      stanceDurationSeconds: durationTicks * this.secondsPerTick,
      totalMaterialPointSlip: builder.accumulatedSlip,
      netMaterialPointDisplacement: horizontalDistance(endpoint, builder.touchdownWorld),
      torsoTravel, torsoPathLength: builder.torsoPathLength, contactImpulseNs: builder.contactImpulseNs,
      anchoringEfficiency: efficiency, preTouchdown: toWindow(pre),
      postTouchdown: { 3: toWindow(post(3)), 6: toWindow(post(6)), 12: toWindow(post(12)) },
      early: toWindow(phase(0, 1 / 3)), mid: toWindow(phase(1 / 3, 2 / 3)), late: toWindow(phase(2 / 3, 1)) };
  }

  private window(samples: readonly TractionSample[]): TractionWindow {
    if (samples.length === 0) return emptyWindow();
    const mean = (value: (sample: TractionSample) => number) => samples.reduce((sum, sample) => sum + value(sample), 0) / samples.length;
    let materialPointSlip = 0;
    for (let i = 1; i < samples.length; i += 1) {
      materialPointSlip += horizontalDistance(samples[i].materialPointPosition, samples[i - 1].materialPointPosition);
    }
    return { samples: [...samples], materialPointSlip,
      meanMaterialPointSpeed: mean((sample) => sample.materialPointSpeed),
      meanTorsoSpeed: mean((sample) => sample.torsoSpeed),
      meanHipRate: { x: mean((sample) => sample.jointRates.hip.x), y: mean((sample) => sample.jointRates.hip.y),
        z: mean((sample) => sample.jointRates.hip.z) },
      meanKneeRate: mean((sample) => sample.jointRates.knee), meanAnkleRate: mean((sample) => sample.jointRates.ankle),
      contactImpulseNs: samples.reduce((sum, sample) => sum + sample.contactImpulseNs, 0) };
  }

  summary(): TractionSummary {
    const paws = [...this.paws.entries()].map(([pawId, paw]) => {
      const episodes = [...paw.episodes, ...(paw.inEpisode
        ? [this.finishEpisode(pawId, paw.inEpisode)] : [])];
      const count = Math.max(1, episodes.length);
      const sustained = episodes.filter((episode) => episode.stanceDurationSeconds >= 0.15);
      const totalEpisodeSlip = episodes.reduce((sum, episode) => sum + episode.totalMaterialPointSlip, 0);
      const totalTravel = episodes.reduce((sum, episode) => sum + episode.torsoTravel, 0);
      return { pawId, contactTicks: paw.contactTicks, airborneTicks: paw.airborneTicks,
        dutyFactor: this.recordedTicks > 0 ? paw.contactTicks / this.recordedTicks : 0,
        contactLosses: paw.contactLosses, stanceEpisodes: episodes.length,
        meanEpisodeSeconds: episodes.reduce((sum, episode) => sum + episode.stanceDurationSeconds, 0) / count,
        meanStrideLength: paw.strideTotal / Math.max(1, episodes.length),
        meanStancePawSlip: episodes.reduce((sum, episode) => sum + episode.netMaterialPointDisplacement, 0) / count,
        meanStanceMaterialPointAccumulatedSlip: totalEpisodeSlip / count, meanStanceTorsoTravel: totalTravel / count,
        meanStancePawSpeed: paw.stanceSpeedSeconds > 0 ? paw.stanceSpeedIntegral / paw.stanceSpeedSeconds : 0,
        meanSwingClearance: paw.airborneTicks > 0 ? paw.swingHeightIntegral / (paw.airborneTicks * this.secondsPerTick) : 0,
        effectiveSwingCount: paw.completedSwingClearances.length,
        meanSwingSoleClearance: paw.completedSwingClearances.length > 0
          ? paw.completedSwingClearances.reduce((sum, value) => sum+value, 0)/paw.completedSwingClearances.length : 0,
        meanSwingLift: paw.completedSwingLifts.length
          ? paw.completedSwingLifts.reduce((sum, lift) => sum + lift, 0) / paw.completedSwingLifts.length : 0,
        sustainedEpisodeSlip: sustained.length > 0
          ? sustained.reduce((sum, episode) => sum + episode.netMaterialPointDisplacement, 0) / sustained.length : 0,
        sustainedAccumulatedEpisodeSlip: sustained.length > 0
          ? sustained.reduce((sum, episode) => sum + episode.totalMaterialPointSlip, 0) / sustained.length : 0,
        sustainedEpisodeTravel: sustained.length > 0
          ? sustained.reduce((sum, episode) => sum + episode.torsoTravel, 0) / sustained.length : 0,
        sustainedEpisodes: sustained.length, episodes, anchoring: anchoringStats(episodes),
        sustainedAnchoring: anchoringStats(sustained) };
    });
    const episodes = paws.flatMap((paw) => paw.episodes);
    const sustained = episodes.filter((episode) => episode.stanceDurationSeconds >= 0.15);
    const totalSlip = episodes.reduce((sum, episode) => sum + episode.netMaterialPointDisplacement, 0);
    const accumulatedSlip = episodes.reduce((sum, episode) => sum + episode.totalMaterialPointSlip, 0);
    const totalTravel = episodes.reduce((sum, episode) => sum + episode.torsoTravel, 0);
    const sustainedSlip = sustained.reduce((sum, episode) => sum + episode.netMaterialPointDisplacement, 0);
    const sustainedAccumulatedSlip = sustained.reduce((sum, episode) => sum + episode.totalMaterialPointSlip, 0);
    const sustainedTravel = sustained.reduce((sum, episode) => sum + episode.torsoTravel, 0);
    const seconds = this.recordedTicks * this.secondsPerTick;
    return { paws, episodes, anchoring: anchoringStats(episodes), sustainedAnchoring: anchoringStats(sustained),
      stanceSlipRatio: totalTravel > 1e-9 ? totalSlip / totalTravel : 0,
      sustainedStanceSlipRatio: sustainedTravel > 1e-9 ? sustainedSlip / sustainedTravel : 0,
      accumulatedStanceSlipRatio: totalTravel > 1e-9 ? accumulatedSlip / totalTravel : 0,
      sustainedAccumulatedStanceSlipRatio: sustainedTravel > 1e-9 ? sustainedAccumulatedSlip / sustainedTravel : 0,
      cumulativeSlipRatio: totalTravel > 1e-9 ? accumulatedSlip / totalTravel : 0,
      sustainedCumulativeSlipRatio: sustainedTravel > 1e-9 ? sustainedAccumulatedSlip / sustainedTravel : 0,
      torsoPathLength: this.torsoPath, torsoMeanSpeed: seconds > 0 ? this.torsoPath / seconds : 0,
      recordedSeconds: seconds };
  }
}
