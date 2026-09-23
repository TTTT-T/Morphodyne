import { isPerceptionCurrent, type AgentPerceptionView } from './sensing';

export interface VectorEstimate {
  readonly value: readonly number[];
  readonly confidence: number;
  readonly observedTick: number;
}

export interface OwnPartEstimate extends VectorEstimate { readonly partId: string }
export interface OwnJointEstimate extends VectorEstimate { readonly connectionId: string }

export interface ContactEstimate {
  readonly lastSeenTick: number | null;
  readonly confidence: number;
  readonly recent: boolean;
}

export interface StabilityEstimate {
  readonly level: 'unknown' | 'stable' | 'uncertain' | 'unstable';
  readonly confidence: number;
}

/** Internal estimates assembled solely from currently available proprioceptive evidence. */
export interface SelfModel {
  readonly tick: number;
  readonly orientation: VectorEstimate | null;
  readonly angularVelocity: VectorEstimate | null;
  readonly localVelocity: VectorEstimate | null;
  readonly parts: readonly OwnPartEstimate[];
  readonly joints: readonly OwnJointEstimate[];
  readonly contacts: ContactEstimate;
  readonly stability: StabilityEstimate;
  /** Sensors that produced a current measurement; a silent sensor may still exist. */
  readonly observedSensorIds: readonly string[];
  readonly proprioceptionAvailable: boolean;
  /** A recently missing measurement, with no claim about its physical cause. */
  readonly lastFeedbackGapTick: number | null;
  readonly feedbackGapRecent: boolean;
}

export interface RangeSurfaceEstimate {
  readonly sensorId: string;
  /** Direction in the range sensor's local frame; no global pose is inferred. */
  readonly localDirection: readonly [number, number, number];
  readonly distance: number;
  readonly confidence: number;
  readonly observedTick: number;
  readonly expiresAtTick: number;
}

export interface WorldModel {
  readonly tick: number;
  readonly ranges: readonly RangeSurfaceEstimate[];
  readonly contact: Omit<ContactEstimate, 'recent'>;
  readonly lastObservationTick: number | null;
}

const CONTACT_MEMORY_TICKS = 30;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function createSelfModel(): SelfModel {
  return { tick: -1, orientation: null, angularVelocity: null, localVelocity: null, parts: [], joints: [],
    contacts: { lastSeenTick: null, confidence: 0, recent: false },
    stability: { level: 'unknown', confidence: 0 }, observedSensorIds: [], proprioceptionAvailable: false,
    lastFeedbackGapTick: null, feedbackGapRecent: false };
}

/** Rebuilds measured fields from each view; absent/expired channels are forgotten immediately. */
export function updateSelfModel(previous: SelfModel, view: AgentPerceptionView): SelfModel {
  const current = view.perceptions.filter((p) => isPerceptionCurrent(p, view.tick));
  const proprio = current.filter((p) => p.channel === 'orientation' || p.channel === 'angular-velocity'
    || p.channel === 'local-velocity' || p.channel === 'relative-pose' || p.channel === 'joint');
  const orientation = estimate(proprio.find((p) => p.channel === 'orientation'));
  const angularVelocity = estimate(proprio.find((p) => p.channel === 'angular-velocity'));
  const localVelocity = estimate(proprio.find((p) => p.channel === 'local-velocity'));
  const parts = proprio.filter((p) => p.channel === 'relative-pose' && p.ownPartId)
    .map((p) => ({ partId: p.ownPartId!, value: [...p.values], confidence: clamp01(p.confidence), observedTick: p.tick }));
  const joints = proprio.filter((p) => p.channel === 'joint' && p.ownConnectionId)
    .map((p) => ({ connectionId: p.ownConnectionId!, value: [...p.values], confidence: clamp01(p.confidence), observedTick: p.tick }));
  const contactEvidence = current.filter((p) => p.channel === 'contact');
  const contact = contactEvidence.length > 0
    ? { lastSeenTick: Math.max(...contactEvidence.map((p) => p.tick)), confidence: Math.max(...contactEvidence.map((p) => clamp01(p.confidence))) }
    : { lastSeenTick: previous.contacts.lastSeenTick, confidence: previous.contacts.confidence };
  const contactRecent = contact.lastSeenTick !== null && view.tick - contact.lastSeenTick <= CONTACT_MEMORY_TICKS;
  const retainedContact = contactRecent ? contact : { lastSeenTick: null, confidence: 0 };
  const avMagnitude = angularVelocity ? Math.hypot(...angularVelocity.value.slice(0, 3)) : null;
  const stability: StabilityEstimate = avMagnitude === null
    ? { level: 'unknown', confidence: 0 }
    : { level: avMagnitude < 0.25 && contactRecent ? 'stable' : avMagnitude > 1.5 ? 'unstable' : 'uncertain',
      confidence: clamp01((angularVelocity?.confidence ?? 0) * (contactRecent ? retainedContact.confidence : 0.5)) };
  const lostFeedback = parts.length < previous.parts.length || joints.length < previous.joints.length;
  const lastFeedbackGapTick = lostFeedback ? view.tick : previous.lastFeedbackGapTick;
  return { tick: view.tick, orientation, angularVelocity, localVelocity, parts, joints,
    contacts: { ...retainedContact, recent: contactRecent }, stability,
    observedSensorIds: [...new Set(current.map((p) => p.sensorId))], proprioceptionAvailable: proprio.length > 0,
    lastFeedbackGapTick, feedbackGapRecent: lastFeedbackGapTick !== null && view.tick - lastFeedbackGapTick <= 30 };
}

export function createWorldModel(): WorldModel {
  return { tick: -1, ranges: [], contact: { lastSeenTick: null, confidence: 0 }, lastObservationTick: null };
}

/** Stores only anonymous sensor-local returns and contact recency supported by perception. */
export function updateWorldModel(previous: WorldModel, view: AgentPerceptionView): WorldModel {
  const current = view.perceptions.filter((p) => isPerceptionCurrent(p, view.tick));
  const ranges: RangeSurfaceEstimate[] = current.filter((p) => p.channel === 'range' && p.values.length >= 4)
    .map((p) => ({ sensorId: p.sensorId,
      localDirection: [p.values[0], p.values[1], p.values[2]], distance: p.values[3],
      confidence: clamp01(p.confidence), observedTick: p.tick, expiresAtTick: p.expiresAtTick }));
  const contacts = current.filter((p) => p.channel === 'contact');
  const observedContact = contacts.length > 0
    ? { lastSeenTick: Math.max(...contacts.map((p) => p.tick)), confidence: Math.max(...contacts.map((p) => clamp01(p.confidence))) }
    : previous.contact;
  const contactIsRecent = observedContact.lastSeenTick !== null && view.tick - observedContact.lastSeenTick <= CONTACT_MEMORY_TICKS;
  const contact = contactIsRecent ? observedContact : { lastSeenTick: null, confidence: 0 };
  const lastObservationTick = current.length > 0 ? Math.max(...current.map((p) => p.tick)) : previous.lastObservationTick;
  return { tick: view.tick, ranges, contact, lastObservationTick };
}

function estimate(perception: AgentPerceptionView['perceptions'][number] | undefined): VectorEstimate | null {
  return perception ? { value: [...perception.values], confidence: clamp01(perception.confidence), observedTick: perception.tick } : null;
}
