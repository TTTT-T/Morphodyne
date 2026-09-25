import './ArenaPanel.css';

import type { WorldRuntime } from '../simulation/WorldRuntime';
import type { ArenaObservation, ArenaObserver } from './ArenaObserver';
import type { ManualControlSource } from './ManualControlSource';

export interface ArenaPanelHandle {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export function mountArenaPanel(
  container: HTMLElement,
  world: WorldRuntime,
  player: ManualControlSource,
  observer: ArenaObserver,
  onReset: () => void | Promise<void>,
): ArenaPanelHandle {
  const panel = document.createElement('section');
  panel.className = 'arena-panel';
  panel.innerHTML = `
    <header><div><strong>Morphodyne Arena</strong><small>WASD / 方向键驾驶；空格暂停</small></div>
      <button type="button" data-action="sandbox">返回沙盒</button></header>
    <div class="arena-actions"><button type="button" data-action="pause">暂停</button>
      <button type="button" data-action="reset">重新开始</button>
      <button type="button" data-action="end">结束本局</button>
      <label>速度 <select data-action="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></label>
      <span data-role="time">时间 0.0 秒</span></div>
    <p class="arena-status" data-role="status">等待观测</p>
    <div class="arena-fighters" data-role="fighters"></div>`;
  container.append(panel);

  const pressed = new Set<string>();
  const normalizeKey = (key: string): string => key.toLowerCase();
  const updateControls = (): void => {
    const forward = Number(pressed.has('w') || pressed.has('arrowup')) - Number(pressed.has('s') || pressed.has('arrowdown'));
    const steer = Number(pressed.has('d') || pressed.has('arrowright')) - Number(pressed.has('a') || pressed.has('arrowleft'));
    // The fixture's wheel joint polarity is inverted: negative drives toward +X.
    player.set('rammer-left-drive', 'joint', Math.max(-1, Math.min(1, -forward - steer * 0.55)));
    player.set('rammer-right-drive', 'joint', Math.max(-1, Math.min(1, -forward + steer * 0.55)));
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const key = normalizeKey(event.key);
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === ' ' && !event.repeat && !observer.observe(world, manualEnd).ended) world.paused = !world.paused;
    pressed.add(key);
    updateControls();
  };
  const onKeyUp = (event: KeyboardEvent): void => { pressed.delete(normalizeKey(event.key)); updateControls(); };
  const clearKeys = (): void => { pressed.clear(); updateControls(); };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', clearKeys);

  const pauseButton = panel.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  let manualEnd = false;
  const time = panel.querySelector<HTMLElement>('[data-role="time"]')!;
  const status = panel.querySelector<HTMLElement>('[data-role="status"]')!;
  const fighters = panel.querySelector<HTMLElement>('[data-role="fighters"]')!;
  pauseButton.addEventListener('click', () => { if (!manualEnd) world.paused = !world.paused; refresh(); });
  panel.querySelector<HTMLSelectElement>('[data-action="speed"]')!.addEventListener('change', (event) => {
    world.setTimeScale(Number((event.currentTarget as HTMLSelectElement).value));
  });
  panel.querySelector<HTMLButtonElement>('[data-action="reset"]')!.addEventListener('click', () => { void onReset(); });
  panel.querySelector<HTMLButtonElement>('[data-action="end"]')!.addEventListener('click', () => {
    manualEnd = true;
    world.paused = true;
    player.clear();
    refresh();
  });
  panel.querySelector<HTMLButtonElement>('[data-action="sandbox"]')!.addEventListener('click', () => { location.hash = ''; });

  function refresh(): void {
    const observation: ArenaObservation = observer.observe(world, manualEnd);
    time.textContent = `时间 ${observation.elapsedSeconds.toFixed(1)} 秒`;
    pauseButton.textContent = observation.ended ? '已结束' : world.paused ? '继续' : '暂停';
    pauseButton.disabled = observation.ended;
    status.textContent = observation.ended ? `本局结束：${observation.reason ?? '未指定原因'}` : (world.paused ? '已暂停' : '对抗进行中');
    fighters.replaceChildren(...observation.fighters.map((fighter) => {
      const card = document.createElement('article');
      card.innerHTML = `<strong></strong><span></span><span></span><span></span>`;
      const [title, position, structure, motion] = [...card.children] as HTMLElement[];
      title.textContent = fighter.entityId === 'rammer' ? 'Rammer · 玩家' : fighter.entityId === 'gripper' ? 'Gripper · 对手' : fighter.entityId;
      position.textContent = `位置 ${fighter.position.x.toFixed(1)}, ${fighter.position.y.toFixed(1)}, ${fighter.position.z.toFixed(1)}`;
      structure.textContent = `结构 ${fighter.connectedComponents} 组件 · ${fighter.separatedConnections} 断开 · ${fighter.fracturedParts} 破裂`;
      motion.textContent = `速度 ${fighter.speedMps.toFixed(2)} m/s · 执行器 ${fighter.activeActuators} · 能量 ${fighter.energyRemainingJ.toFixed(0)} J`;
      return card;
    }));
  }
  refresh();
  return {
    element: panel,
    refresh,
    destroy: () => { clearKeys(); removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); removeEventListener('blur', clearKeys); panel.remove(); },
  };
}
