import type { Quaternion } from '../core/model';
import type { WorldRuntime } from '../simulation/WorldRuntime';

/**
 * Repeatable locomotion measurement for any four-paw body. It reads only world
 * state after each tick: floor contact, paw pose/velocity and torso motion.
 *
 * Definitions:
 * - stance episode: one maximal run of consecutive floor-contact ticks per paw;
 * - stance paw slip: horizontal distance the same contacting material point
 *   travels during its own stance episode. The point is stored in paw-local
 *   coordinates at episode start and re-emitted in world coordinates at episode
 *   end, so a gripping paw pad stays near zero regardless of leg rotation;
 * - stance torso travel: horizontal torso displacement over the same window;
 * - stance slip ratio: sum(stance paw slip) / sum(stance torso travel).
 */
export interface PawTractionSummary {
  readonly pawId: string;
  readonly contactTicks: number;
  readonly airborneTicks: number;
  readonly dutyFactor: number;
  readonly contactLosses: number;
  readonly stanceEpisodes: number;
  readonly meanEpisodeSeconds: number;
  readonly meanStrideLength: number;
  readonly meanStancePawSlip: number;
  readonly meanStanceTorsoTravel: number;
  readonly meanStancePawSpeed: number;
  readonly meanSwingClearance: number;
  /** Slip across support episodes lasting at least 0.15s. */
  readonly sustainedEpisodeSlip: number;
  readonly sustainedEpisodeTravel: number;
  readonly sustainedEpisodes: number;
}

export interface TractionSummary {
  readonly paws: readonly PawTractionSummary[];
  readonly stanceSlipRatio: number;
  /** Slip ratio over support episodes of at least 0.15s: real gliding, not touchdown transients. */
  readonly sustainedStanceSlipRatio: number;
  readonly torsoPathLength: number;
  readonly torsoMeanSpeed: number;
  readonly recordedSeconds: number;
}

interface PawAccumulator {
  contactTicks: number;
  airborneTicks: number;
  contactLosses: number;
  episodes: number;
  episodeSeconds: number;
  episodePawSlip: number;
  episodeTorsoTravel: number;
  stanceSpeedSeconds: number;
  stanceSpeedIntegral: number;
  swingHeightIntegral: number;
  inEpisode: boolean;
  episodeTicks: number;
  episodeContactWorld: { x: number; z: number } | null;
  episodeContactLocal: { x: number; y: number; z: number } | null;
  episodeStartTorso: { x: number; z: number } | null;
  lastTouchdown: { x: number; z: number } | null;
  strideTotal: number;
  sustainedSlip: number;
  sustainedTravel: number;
  sustainedCount: number;
}

function rotateVector(q: Quaternion, v: { x: number; y: number; z: number }) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return { x: v.x + q.w * tx + q.y * tz - q.z * ty,
    y: v.y + q.w * ty + q.z * tx - q.x * tz,
    z: v.z + q.w * tz + q.x * ty - q.y * tx };
}

const horizontalDistance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

/** Observer-side instrument: it measures a run but never feeds the Agent. */
export class LeopardTractionInstrument {
  private readonly paws = new Map<string, PawAccumulator>();
  private recordedTicks = 0;
  private torsoPath = 0;
  private lastTorso: { x: number; z: number } | null = null;
  private secondsPerTick = 1 / 60;

  constructor(
    private readonly pawIds: readonly string[],
    private readonly torsoPartId = 'leopard-chest',
  ) {}

  record(world: WorldRuntime, entityId: string, secondsPerTick: number): void {
    const torso = world.readPartPose(entityId, this.torsoPartId).position;
    const torsoPoint = { x: torso.x, z: torso.z };
    if (this.lastTorso) this.torsoPath += horizontalDistance(torsoPoint, this.lastTorso);
    this.lastTorso = torsoPoint;
    for (const pawId of this.pawIds) {
      let paw = this.paws.get(pawId);
      if (!paw) {
        paw = { contactTicks: 0, airborneTicks: 0, contactLosses: 0, episodes: 0, episodeSeconds: 0,
          episodePawSlip: 0, episodeTorsoTravel: 0, stanceSpeedSeconds: 0, stanceSpeedIntegral: 0,
          swingHeightIntegral: 0, inEpisode: false, episodeTicks: 0, episodeContactWorld: null,
          episodeContactLocal: null, episodeStartTorso: null, lastTouchdown: null, strideTotal: 0,
          sustainedSlip: 0, sustainedTravel: 0, sustainedCount: 0 };
        this.paws.set(pawId, paw);
      }
      const pose = world.readPartPose(entityId, pawId).position;
      const pawPose = world.readPartPose(entityId, pawId);
      const point = { x: pose.x, z: pose.z };
      this.secondsPerTick = secondsPerTick;
      const floorContacts = world.readPartContacts(entityId, pawId)
        .filter((contact) => contact.otherEntityId === undefined);
      const touching = floorContacts.length > 0;
      if (touching) {
        paw.contactTicks += 1;
        const velocity = world.readPartVelocity(entityId, pawId);
        if (velocity) {
          paw.stanceSpeedSeconds += secondsPerTick;
          paw.stanceSpeedIntegral += Math.hypot(velocity.x, velocity.z) * secondsPerTick;
        }
        if (!paw.inEpisode) {
          if (paw.lastTouchdown) paw.strideTotal += horizontalDistance(point, paw.lastTouchdown);
          paw.lastTouchdown = point;
          paw.inEpisode = true;
          paw.episodes += 1;
          paw.episodeTicks = 0;
          const contact = floorContacts.reduce((best, candidate) =>
            candidate.impulseNs > best.impulseNs ? candidate : best);
          const inverse = { x: -pawPose.rotation.x, y: -pawPose.rotation.y,
            z: -pawPose.rotation.z, w: pawPose.rotation.w };
          const relative = { x: contact.point.x - pawPose.position.x,
            y: contact.point.y - pawPose.position.y, z: contact.point.z - pawPose.position.z };
          const local = rotateVector(inverse, relative);
          paw.episodeContactWorld = { x: contact.point.x, z: contact.point.z };
          paw.episodeContactLocal = local;
          paw.episodeStartTorso = torsoPoint;
        }
        paw.episodeTicks += 1;
      } else {
        paw.airborneTicks += 1;
        paw.swingHeightIntegral += pose.y * secondsPerTick;
        if (paw.inEpisode) {
          paw.contactLosses += 1;
          paw.episodeSeconds += paw.episodeTicks * this.secondsPerTick;
          const local = paw.episodeContactLocal;
          const end = local ? rotateVector(pawPose.rotation, local) : null;
          const slip = end && paw.episodeContactWorld
            ? horizontalDistance({ x: pawPose.position.x + end.x, z: pawPose.position.z + end.z },
              paw.episodeContactWorld)
            : 0;
          const travel = horizontalDistance(torsoPoint, paw.episodeStartTorso ?? torsoPoint);
          paw.episodePawSlip += slip;
          paw.episodeTorsoTravel += travel;
          if (paw.episodeTicks * this.secondsPerTick >= 0.15) {
            paw.sustainedSlip += slip;
            paw.sustainedTravel += travel;
            paw.sustainedCount += 1;
          }
          paw.inEpisode = false;
          paw.episodeContactWorld = null;
          paw.episodeContactLocal = null;
          paw.episodeStartTorso = null;
        }
      }
    }
    this.recordedTicks += 1;
  }

  summary(): TractionSummary {
    const paws = [...this.paws.entries()].map(([pawId, paw]) => {
      const episodeCount = Math.max(1, paw.episodes);
      const contactLosses = Math.max(1, paw.contactLosses);
      return {
        pawId,
        contactTicks: paw.contactTicks,
        airborneTicks: paw.airborneTicks,
        dutyFactor: this.recordedTicks > 0 ? paw.contactTicks / this.recordedTicks : 0,
        contactLosses: paw.contactLosses,
        stanceEpisodes: paw.episodes,
        meanEpisodeSeconds: paw.episodeSeconds / contactLosses,
        meanStrideLength: paw.strideTotal / episodeCount,
        meanStancePawSlip: paw.episodePawSlip / contactLosses,
        meanStanceTorsoTravel: paw.episodeTorsoTravel / contactLosses,
        meanStancePawSpeed: paw.stanceSpeedSeconds > 0
          ? paw.stanceSpeedIntegral / paw.stanceSpeedSeconds : 0,
        meanSwingClearance: paw.airborneTicks > 0
          ? paw.swingHeightIntegral / (paw.airborneTicks * this.secondsPerTick) : 0,
        sustainedEpisodeSlip: paw.sustainedCount > 0 ? paw.sustainedSlip / paw.sustainedCount : 0,
        sustainedEpisodeTravel: paw.sustainedCount > 0 ? paw.sustainedTravel / paw.sustainedCount : 0,
        sustainedEpisodes: paw.sustainedCount,
      };
    });
    const totalSlip = [...this.paws.values()].reduce((sum, paw) => sum + paw.episodePawSlip, 0);
    const totalTravel = [...this.paws.values()].reduce((sum, paw) => sum + paw.episodeTorsoTravel, 0);
    const sustainedSlip = [...this.paws.values()].reduce((sum, paw) => sum + paw.sustainedSlip, 0);
    const sustainedTravel = [...this.paws.values()].reduce((sum, paw) => sum + paw.sustainedTravel, 0);
    const seconds = this.recordedTicks / 60;
    return {
      paws,
      stanceSlipRatio: totalTravel > 1e-9 ? totalSlip / totalTravel : 0,
      sustainedStanceSlipRatio: sustainedTravel > 1e-9 ? sustainedSlip / sustainedTravel : 0,
      torsoPathLength: this.torsoPath,
      torsoMeanSpeed: seconds > 0 ? this.torsoPath / seconds : 0,
      recordedSeconds: seconds,
    };
  }
}
