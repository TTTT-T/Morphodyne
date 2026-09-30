import './ArenaPanel.css';

import type { WorldRuntime } from '../simulation/WorldRuntime';
import type { ArenaObservation, ArenaObserver } from './ArenaObserver';

export interface ArenaPanelHandle {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

const fighterNames: Readonly<Record<string, string>> = {
  'leopard-a': '豹子 A',
  'leopard-b': '豹子 B',
};
const goalNames: Readonly<Record<string, string>> = {
  'maintain-stability': '恢复姿态',
  'approach-anonymous-return': '接近感知目标',
  'interact-near-contact': '近距离接触',
  'continue-exploration': '寻找目标',
  '等待感知': '等待感知',
};
const skillNames: Readonly<Record<string, string>> = {
  stand: '支撑姿态', approach: '接近', interact: '头颌与前肢接触',
  turn: '转向', forward: '前进',
};
const stabilityNames: Readonly<Record<string, string>> = {
  stable: '稳定', uncertain: '调整中', unstable: '失稳', unknown: '未知',
};

/** A read-only match panel. Agent intent and physical outcomes come from the observer. */
export function mountArenaPanel(
  container: HTMLElement,
  world: WorldRuntime,
  observer: ArenaObserver,
  onReset: () => void | Promise<void>,
): ArenaPanelHandle {
  const panel = document.createElement('section');
  panel.className = 'arena-panel';
  panel.innerHTML = `
    <header>
      <div><strong>Animal Arena</strong><small>观察模式 · 空格暂停</small></div>
      <button type="button" data-action="sandbox">返回沙盒</button>
    </header>
    <div class="arena-actions">
      <button type="button" data-action="pause">暂停</button>
      <button type="button" data-action="reset">重新开始</button>
      <button type="button" data-action="end">结束本局</button>
      <label>速度 <select data-action="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></label>
      <span data-role="time">时间 0.0 秒</span>
    </div>
    <p class="arena-status" data-role="status">等待观测</p>
    <div class="arena-fighters" data-role="fighters"></div>`;
  container.append(panel);

  let manualEnd = false;
  const pauseButton = panel.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  const time = panel.querySelector<HTMLElement>('[data-role="time"]')!;
  const status = panel.querySelector<HTMLElement>('[data-role="status"]')!;
  const fighters = panel.querySelector<HTMLElement>('[data-role="fighters"]')!;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ' || event.repeat) return;
    event.preventDefault();
    const observation = observer.observe(world, manualEnd);
    if (!observation.ended) {
      world.paused = !world.paused;
      refresh();
    }
  };
  addEventListener('keydown', onKeyDown);

  pauseButton.addEventListener('click', () => {
    const observation = observer.observe(world, manualEnd);
    if (!observation.ended) world.paused = !world.paused;
    refresh();
  });
  panel.querySelector<HTMLSelectElement>('[data-action="speed"]')!.addEventListener('change', (event) => {
    world.setTimeScale(Number((event.currentTarget as HTMLSelectElement).value));
  });
  panel.querySelector<HTMLButtonElement>('[data-action="reset"]')!.addEventListener('click', () => {
    void onReset();
  });
  panel.querySelector<HTMLButtonElement>('[data-action="end"]')!.addEventListener('click', () => {
    manualEnd = true;
    world.paused = true;
    refresh();
  });
  panel.querySelector<HTMLButtonElement>('[data-action="sandbox"]')!.addEventListener('click', () => {
    location.hash = '';
  });

  function refresh(): void {
    const observation: ArenaObservation = observer.observe(world, manualEnd);
    time.textContent = `时间 ${observation.elapsedSeconds.toFixed(1)} 秒`;
    pauseButton.textContent = observation.ended ? '已结束' : world.paused ? '继续' : '暂停';
    pauseButton.disabled = observation.ended;
    status.textContent = observation.ended
      ? `本局结束：${observation.reason ?? '未指定原因'}`
      : world.paused ? '已暂停' : '对抗进行中';
    fighters.replaceChildren(...observation.fighters.map((fighter) => {
      const card = document.createElement('article');
      card.className = `arena-fighter ${fighter.entityId}`;

      const title = document.createElement('strong');
      title.textContent = fighterNames[fighter.entityId] ?? fighter.entityId;
      card.append(title);

      const goal = document.createElement('span');
      goal.textContent = `目标 ${goalNames[fighter.goal] ?? fighter.goal}`;
      card.append(goal);

      const skill = document.createElement('span');
      skill.textContent = `技能 ${skillNames[fighter.skill] ?? fighter.skill}`;
      card.append(skill);

      const stability = document.createElement('span');
      stability.textContent = `稳定性 ${stabilityNames[fighter.stability] ?? fighter.stability}`;
      card.append(stability);

      const energy = document.createElement('span');
      energy.textContent = `能量 ${fighter.energyRemainingJ.toFixed(0)} J`;
      card.append(energy);

      const structure = document.createElement('span');
      structure.textContent = `结构 ${fighter.fracturedParts} 部件破裂 · ${fighter.separatedConnections} 连接断开`;
      card.append(structure);

      return card;
    }));
  }

  refresh();
  return {
    element: panel,
    refresh,
    destroy: () => {
      removeEventListener('keydown', onKeyDown);
      panel.remove();
    },
  };
}
