import type { EntityId, Pose } from '../core/model';
import type { BodyHandle } from './PhysicsAdapter';

/** Runtime identity and pose access for one Blueprint instance. Backend objects stay in the adapter. */
export interface PhysicsBody {
  readonly entityId: EntityId;
  readonly partHandles: ReadonlyMap<string, BodyHandle>;
  readonly connectionHandles: ReadonlyMap<string, number>;
  readPartPose(partId: string): Pose;
}
