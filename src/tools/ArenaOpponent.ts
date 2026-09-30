import { createControlSignal } from '../core/actuation';
import type { Vector3 } from '../core/model';
import type { WorldControlSource } from '../simulation/WorldRuntime';
import { WorldRuntime } from '../simulation/WorldRuntime';

function horizontalDirection(from: Vector3, to: Vector3): Vector3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, y: 0, z: dz / length };
}

function forwardFromRotation(rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }): Vector3 {
  // This fixture's front is local -X; use the current physical chassis orientation.
  return { x: -1 + 2 * (rotation.y ** 2 + rotation.z ** 2), y: 0,
    z: -2 * (rotation.x * rotation.z - rotation.w * rotation.y) };
}

/** Simple opponent uses approximate relative pose and emits only normalized actuator commands. */
export function createArenaOpponent(world: WorldRuntime): WorldControlSource {
  return () => {
    const own = world.readPartPose('gripper', 'gripper-chassis');
    const other = world.readPartPose('rammer', 'rammer-chassis');
    const toward = horizontalDirection(own.position, other.position);
    const heading = forwardFromRotation(own.rotation);
    const alignment = heading.x * toward.x + heading.z * toward.z;
    const turn = heading.x * toward.z - heading.z * toward.x;
    const drive = alignment > -0.25 ? 0.85 : 0;
    const steer = Math.max(-0.55, Math.min(0.55, turn * 1.1));
    const close = Math.hypot(other.position.x - own.position.x, other.position.z - own.position.z) < 1.25;
    return [
      createControlSignal('gripper-left-drive', Math.max(-1, Math.min(1, drive - steer))),
      createControlSignal('gripper-right-drive', Math.max(-1, Math.min(1, drive + steer))),
      createControlSignal('gripper-left-close', close ? 1 : 0),
      createControlSignal('gripper-right-close', close ? -1 : 0),
    ];
  };
}
