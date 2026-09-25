import type { EnvironmentSpec } from '../core/environment';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { ArenaObserver } from './ArenaObserver';
import { LeopardAgentRuntime } from './LeopardAgent';
import { createLeopardBlueprint } from './LeopardBlueprint';

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
  readonly agents: ReadonlyMap<string, LeopardAgentRuntime>;
  readonly observer: ArenaObserver;
}

/** A fresh PhysicsAdapter and WorldRuntime also reset tick, energy, damage, and issued IDs. */
export async function createArenaSession(): Promise<ArenaSession> {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics, arenaEnvironment);
  const construction = new ConstructionRuntime(world);
  const agents = new Map<string, LeopardAgentRuntime>();
  for (const [id, x, z, facing] of [
    ['leopard-a', -2.3, 0, 1], ['leopard-b', 2.3, 0.6, -1],
  ] as const) {
    const agent = new LeopardAgentRuntime();
    agents.set(id, agent);
    construction.spawn({ id, blueprint: createLeopardBlueprint({ facing }) }, {
      origin: { x, y: 0, z },
      energy: { capacityJ: 12000, maxPowerWatts: 650, efficiency: 0.82 },
      agent: { control: (seconds) => agent.control(world.readSensorRuntime(id)?.readAgentView()
        ?? { tick: -1, perceptions: [] }, seconds) },
    });
  }
  return { world, construction, agents, observer: new ArenaObserver(agents) };
}
