import type { EnvironmentSpec } from '../core/environment';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { ArenaObserver } from './ArenaObserver';
import { createArenaOpponent } from './ArenaOpponent';
import { createGripperFighterBlueprint, createRammerBlueprint } from './ArenaFixtures';
import { ManualControlSource } from './ManualControlSource';

const arenaEnvironment: EnvironmentSpec = {
  surfaces: [
    { id: 'arena-floor', position: { x: 0, y: -0.15, z: 0 },
      halfExtents: { x: 7.5, y: 0.15, z: 5.5 }, friction: 1.4 },
    { id: 'arena-west', position: { x: -7.6, y: 0.7, z: 0 },
      halfExtents: { x: 0.15, y: 0.7, z: 5.5 }, friction: 0.8 },
    { id: 'arena-east', position: { x: 7.6, y: 0.7, z: 0 },
      halfExtents: { x: 0.15, y: 0.7, z: 5.5 }, friction: 0.8 },
    { id: 'arena-north', position: { x: 0, y: 0.7, z: -5.6 },
      halfExtents: { x: 7.5, y: 0.7, z: 0.15 }, friction: 0.8 },
    { id: 'arena-south', position: { x: 0, y: 0.7, z: 5.6 },
      halfExtents: { x: 7.5, y: 0.7, z: 0.15 }, friction: 0.8 },
  ],
  state: { weather: 'clear', timeOfDay: 12 },
};

export interface ArenaSession {
  readonly world: WorldRuntime;
  readonly construction: ConstructionRuntime;
  readonly player: ManualControlSource;
  readonly observer: ArenaObserver;
}

/** A fresh PhysicsAdapter and WorldRuntime also reset tick, energy, damage, and issued IDs. */
export async function createArenaSession(): Promise<ArenaSession> {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics, arenaEnvironment);
  const construction = new ConstructionRuntime(world);
  const player = new ManualControlSource();
  construction.spawn({ id: 'rammer', blueprint: createRammerBlueprint() }, {
    origin: { x: -2.3, y: 0, z: 0 },
    energy: { capacityJ: 8000, maxPowerWatts: 300, efficiency: 0.82 },
    control: player.control,
  });
  construction.spawn({ id: 'gripper', blueprint: createGripperFighterBlueprint() }, {
    origin: { x: 2.3, y: 0, z: 0 },
    energy: { capacityJ: 8000, maxPowerWatts: 300, efficiency: 0.82 },
    control: createArenaOpponent(world),
  });
  world.paused = true;
  return { world, construction, player, observer: new ArenaObserver() };
}
