import './style.css';
import type { Pose, Vector3 } from './core/model';
import type { EnvironmentSpec } from './core/environment';
import { RapierPhysicsAdapter } from './physics/RapierPhysicsAdapter';
import { ThreeSmokeRenderer } from './rendering/ThreeSmokeRenderer';
import { ConstructionRuntime } from './simulation/ConstructionRuntime';
import { WorldRuntime } from './simulation/WorldRuntime';
import { mountGodSandboxPanel } from './tools/GodSandboxPanel';
import { createArenaSession } from './tools/ArenaSession';
import { mountArenaPanel, type ArenaPanelHandle } from './tools/ArenaPanel';
import { arenaPartVisual } from './tools/ArenaVisuals';

const ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;
const WORKBENCH: EnvironmentSpec = {
  surfaces: [{ id: 'workbench-ground', halfExtents: { x: 8, y: 0.1, z: 8 },
    position: { x: 0, y: -0.1, z: 0 }, friction: 0.9, wetFriction: 0.55 }],
  state: { weather: 'clear', timeOfDay: 12 },
};

function localPoint(pose: Pose, local: Vector3): Vector3 {
  const q = pose.rotation;
  const tx = 2 * (q.y * local.z - q.z * local.y);
  const ty = 2 * (q.z * local.x - q.x * local.z);
  const tz = 2 * (q.x * local.y - q.y * local.x);
  return {
    x: pose.position.x + local.x + q.w * tx + q.y * tz - q.z * ty,
    y: pose.position.y + local.y + q.w * ty + q.z * tx - q.x * tz,
    z: pose.position.z + local.z + q.w * tz + q.x * ty - q.y * tx,
  };
}

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('缺少页面根元素 #app');
  const renderer = new ThreeSmokeRenderer(app);
  if (location.hash === '#arena') {
    await runArena(app, renderer);
    return;
  }
  const arenaLink = document.createElement('button');
  arenaLink.className = 'arena-entry';
  arenaLink.textContent = '进入 Arena';
  Object.assign(arenaLink.style, { position: 'fixed', right: '16px', top: '16px', zIndex: '20',
    padding: '8px 12px', color: '#edf2f3', background: '#303e48', border: '1px solid #63737e', borderRadius: '5px', cursor: 'pointer' });
  arenaLink.addEventListener('click', () => { location.hash = 'arena'; });
  app.append(arenaLink);
  addEventListener('hashchange', () => { if (location.hash === '#arena') location.reload(); });
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics, WORKBENCH);
  const construction = new ConstructionRuntime(world);
  world.paused = true;
  for (const surface of world.environment.listSurfaces()) {
    renderer.addEnvironmentSurface(surface.id, surface.halfExtents,
      { position: surface.position, rotation: surface.rotation ?? ROTATION }, 0x485862);
  }

  let selectedEntityId: string | undefined;
  let selectedPartId: string | undefined;
  const renderedHandles = new Set<number>();
  const connectionIds = new Set<string>();
  const actuatorIds = new Set<string>();
  const tensionIds = new Set<string>();
  function syncRender(): void {
    const currentHandles = new Set<number>();
    const currentConnections = new Set<string>();
    const currentActuators = new Set<string>();
    const currentTensions = new Set<string>();
    for (const entity of world.listEntities()) {
      const blueprint = world.readBlueprint(entity.id);
      const body = world.getPhysicsBody(entity.id);
      const damage = construction.inspect(entity.id).damage;
      for (const part of blueprint.parts) {
        const handle = body.partHandles.get(part.id);
        if (handle === undefined) continue;
        currentHandles.add(handle);
        if (!renderedHandles.has(handle)) renderer.addPart(handle, part.geometry,
          entity.id.includes('payload') ? 0xe0aa70 : 0x86b9ad);
        renderer.setPose(handle, body.readPartPose(part.id));
      }
      for (const connection of blueprint.connections) {
        if (!body.partHandles.has(connection.fromPartId) || !body.partHandles.has(connection.toPartId)) continue;
        const id = `${entity.id}/${connection.id}`;
        currentConnections.add(id);
        const from = localPoint(body.readPartPose(connection.fromPartId), connection.fromAnchor);
        const to = localPoint(body.readPartPose(connection.toPartId), connection.toAnchor);
        const state = damage.connections[connection.id];
        renderer.setDebugConnection(id, from, to, state?.connected ? 'active' : 'separated');
      }
      for (const actuator of blueprint.actuators ?? []) {
        const id = `${entity.id}/${actuator.id}`;
        if (actuator.kind === 'tension') {
          if (!body.partHandles.has(actuator.fromPartId) || !body.partHandles.has(actuator.toPartId)) continue;
          currentTensions.add(id);
          renderer.setTensionAttachmentPoints(id,
            localPoint(body.readPartPose(actuator.fromPartId), actuator.fromAttachment),
            localPoint(body.readPartPose(actuator.toPartId), actuator.toAttachment), 'active');
        } else {
          const connection = blueprint.connections.find((item) => item.id === actuator.connectionId);
          if (!connection || !body.partHandles.has(connection.fromPartId) || !body.partHandles.has(connection.toPartId)) continue;
          currentActuators.add(id);
          renderer.setDebugActuator(id,
            localPoint(body.readPartPose(connection.fromPartId), connection.fromAnchor),
            localPoint(body.readPartPose(connection.toPartId), connection.toAnchor),
            damage.connections[connection.id]?.connected ? 'active' : 'separated');
        }
      }
    }
    for (const handle of renderedHandles) if (!currentHandles.has(handle)) renderer.removePart(handle);
    for (const id of connectionIds) if (!currentConnections.has(id)) renderer.removeDebugConnection(id);
    for (const id of actuatorIds) if (!currentActuators.has(id)) renderer.removeDebugActuator(id);
    for (const id of tensionIds) if (!currentTensions.has(id)) renderer.removeTensionAttachmentPoints(id);
    renderedHandles.clear(); for (const handle of currentHandles) renderedHandles.add(handle);
    connectionIds.clear(); for (const id of currentConnections) connectionIds.add(id);
    actuatorIds.clear(); for (const id of currentActuators) actuatorIds.add(id);
    tensionIds.clear(); for (const id of currentTensions) tensionIds.add(id);
    const selectedHandle = selectedEntityId && selectedPartId
      ? world.inspectEntity(selectedEntityId) && world.getPhysicsBody(selectedEntityId).partHandles.get(selectedPartId)
      : undefined;
    renderer.setSelectedPart(selectedHandle || undefined);
    renderer.setDaylightFactor(world.environment.state.daylightFactor);
  }

  const sandboxPanel = mountGodSandboxPanel(app, world, construction, syncRender, {
    onSelectionChanged: (entityId, partId) => { selectedEntityId = entityId; selectedPartId = partId; },
  });
  syncRender();
  let previousTime: number | undefined;
  let lastRefreshTick = -1;
  function frame(now: number): void {
    const elapsed = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    world.advance(elapsed);
    if (world.tick !== lastRefreshTick && world.tick % 15 === 0) {
      sandboxPanel.refresh();
      lastRefreshTick = world.tick;
    }
    syncRender();
    renderer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function runArena(app: HTMLElement, renderer: ThreeSmokeRenderer): Promise<void> {
  let session = await createArenaSession();
  let panel: ArenaPanelHandle | undefined;
  let renderedHandles = new Set<number>();
  const drawSession = (): void => {
    renderer.clearWorldVisuals();
    renderedHandles = new Set<number>();
    renderer.frameArena();
    renderer.setDaylightFactor(1);
    for (const surface of session.world.environment.listSurfaces()) {
      renderer.addEnvironmentSurface(surface.id, surface.halfExtents,
        { position: surface.position, rotation: surface.rotation ?? ROTATION },
        surface.id === 'arena-floor' ? 0x29343a : 0x4c6067);
    }
    renderer.addArenaMarkings();
    for (const entity of session.world.listEntities()) {
      const blueprint = session.world.readBlueprint(entity.id);
      const body = session.world.getPhysicsBody(entity.id);
      for (const part of blueprint.parts) {
        const handle = body.partHandles.get(part.id);
        if (handle === undefined) continue;
        renderedHandles.add(handle);
        renderer.addPart(handle, part.geometry, entity.id === 'leopard-a' ? 0xd8a354 : 0xc68b3c,
          arenaPartVisual(part.id));
        renderer.setPose(handle, body.readPartPose(part.id));
      }
    }
  };
  const mount = (): void => {
    panel?.destroy();
    panel = mountArenaPanel(app, session.world, session.observer, async () => {
      session = await createArenaSession();
      drawSession();
      mount();
    });
  };
  drawSession();
  mount();
  addEventListener('hashchange', () => { if (location.hash !== '#arena') location.reload(); });
  let previousTime: number | undefined;
  let lastRefreshTick = -1;
  function frame(now: number): void {
    const elapsed = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    session.world.advance(elapsed);
    if (session.observer.observe(session.world).ended) session.world.paused = true;
    if (session.world.tick !== lastRefreshTick && session.world.tick % 15 === 0) {
      panel?.refresh();
      lastRefreshTick = session.world.tick;
    }
    for (const entity of session.world.listEntities()) {
      const body = session.world.getPhysicsBody(entity.id);
      const damage = session.world.getDamageRuntime(entity.id).state;
      for (const part of session.world.readBlueprint(entity.id).parts) {
        const handle = body.partHandles.get(part.id);
        if (handle !== undefined && renderedHandles.has(handle)) {
          renderer.setPose(handle, body.readPartPose(part.id));
          renderer.setPartCondition(handle, damage.parts[part.id]?.damage.state ?? 'intact');
        }
      }
    }
    renderer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app) app.textContent = `沙盒启动失败：${error instanceof Error ? error.message : String(error)}`;
});
