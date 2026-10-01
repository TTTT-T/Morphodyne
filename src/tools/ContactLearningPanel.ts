import './ArenaPanel.css';
import {saveContactTraining,readContactTraining} from './ContactExperienceTransfer';
import type { ThreeSmokeRenderer } from '../rendering/ThreeSmokeRenderer';
import {
  CONTACT_INITIAL_PARAMETERS,
  CONTACT_TEST_OFFSETS,
  createContactLearningTrial,
  trainContactSkill,
  trainDisturbedContact,
  contactTestDisturbances,
  type ContactTrialKind,
} from './ContactLearningTrial';

type Trial = Awaited<ReturnType<typeof createContactLearningTrial>>;

const kindLabels: Record<ContactTrialKind, string> = {
  machine: '双轴机械颌（局部机构）',
  body: '隔离颈颌链（胸部 200 kg 被动平台支撑）',
  'extended-body': '前端接触形态隔离链（200 kg 被动支撑）',
  'extended-free-body': '前端接触形态完整四足',
  'free-body': '完整四足（原有姿态维持控制）',
};

export interface ContactLearningPanelHandle {
  frame(): void;
  destroy(): void;
}

export async function mountContactLearningPanel(
  host: HTMLElement,
  renderer: ThreeSmokeRenderer,
): Promise<ContactLearningPanelHandle> {
  renderer.clearWorldVisuals();
  renderer.frameArena();
  renderer.setDaylightFactor(1);

  const panel = document.createElement('section');
  panel.className = 'arena-panel';
  panel.setAttribute('aria-label', '身体接触学习实验');
  panel.innerHTML = `
    <header>
      <div><strong>身体接触学习实验</strong><small>传感反馈控制 · 外部物理测量</small></div>
      <button type="button" data-action="home">返回沙盒</button>
    </header>
    <div class="arena-actions">
      <label>实验 <select data-action="experiment"><option value="static">静态对照</option><option value="disturbed">明显冲击后接触</option></select></label>
      <label>结构 <select data-action="kind">
        <option value="machine">双轴机械颌（局部机构）</option>
        <option value="body">隔离颈颌链（胸部 200 kg 被动平台支撑）</option>
        <option value="extended-body">前端接触形态隔离链</option><option value="extended-free-body">前端接触形态完整四足</option><option value="free-body">完整四足（原有姿态维持控制）</option>
      </select></label>
      <label>未见偏移 <select data-action="offset"></select></label>
      <label>控制 <select data-action="mode"><option value="baseline">固定基线 [.25, .30]</option><option value="learned" disabled>训练冻结参数</option></select></label>
    </div>
    <div class="arena-actions">
      <button type="button" data-action="run">运行</button>
      <button type="button" data-action="pause" disabled>暂停</button>
      <button type="button" data-action="restart">重新开始</button>
      <button type="button" data-action="train">训练并复播</button><button type="button" data-action="arena" disabled>用保存的 v2 经验观察双动物</button>
      <span data-role="tick">步数 0 / 180</span>
    </div>
    <p class="arena-status" data-role="status" aria-live="polite">准备实验</p>
    <div class="arena-fighters">
      <article class="arena-fighter" data-role="sensor">
        <strong>内部传感反馈</strong>
        <span data-value="score">评分：—</span>
        <span data-value="sensor-contact">内部双侧接触：—</span>
        <span data-value="params">当前参数：—</span>
      </article>
      <article class="arena-fighter leopard-b" data-role="external">
        <strong>外部物理测量</strong>
        <span data-value="external-contact">目标双侧受力连续步数：—</span>
        <span data-value="energy">实际能量消耗：—</span>
        <span data-value="gate">单次结果：未运行</span>
      </article>
    </div>
    <p data-role="protocol" style="margin:10px 0 0;color:#ead9aa"></p><p style="margin:10px 0 0;color:#ead9aa">传感评分来自本体匿名感知；目标接触与能量由独立外部观察者测量。单次复播不能代表整套样本验收。完整四足使用原有姿态维持控制，隔离链的 200 kg 胸部与平台仅用于局部诊断。</p>`;
  host.append(panel);

  const experimentSelect=panel.querySelector<HTMLSelectElement>('[data-action="experiment"]')!;
  const kindSelect = panel.querySelector<HTMLSelectElement>('[data-action="kind"]')!;
  const offsetSelect = panel.querySelector<HTMLSelectElement>('[data-action="offset"]')!;
  const modeSelect = panel.querySelector<HTMLSelectElement>('[data-action="mode"]')!;
  const runButton = panel.querySelector<HTMLButtonElement>('[data-action="run"]')!;
  const pauseButton = panel.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  const restartButton = panel.querySelector<HTMLButtonElement>('[data-action="restart"]')!;
  const trainButton = panel.querySelector<HTMLButtonElement>('[data-action="train"]')!;
  const arenaButton=panel.querySelector<HTMLButtonElement>('[data-action="arena"]')!;
  const status = panel.querySelector<HTMLElement>('[data-role="status"]')!;
  const tickText = panel.querySelector<HTMLElement>('[data-role="tick"]')!;
  const value = (name: string): HTMLElement => panel.querySelector<HTMLElement>(`[data-value="${name}"]`)!;
  CONTACT_TEST_OFFSETS.forEach((offset, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `位置 ${index + 1}（${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(3)} m）`;
    offsetSelect.append(option);
  });

  let trial: Trial;
  let activeKind: ContactTrialKind = 'machine';
  let learnedParameters = new Map<ContactTrialKind, readonly number[]>();
  let parameters: readonly number[] = CONTACT_INITIAL_PARAMETERS;
  let running = false;
  let busy = false;
  let ended = false;
  let revision=0;

  function refresh(): void {
    if (!trial) return;
    const result = trial.inspect();
    const experience = result.experience;
    const progressed = trial.world.tick;
    const disturbed=experimentSelect.value==='disturbed';
    const gateLabel=disturbed?'16样本（8位置×2时刻）':'8位置';
    const passed=disturbed?result.postLongestBilateralTicks>=30 && result.recoveryTicks>=0 && result.recoveryTicks<=60:result.longestBilateralTicks>=30;
    panel.querySelector<HTMLElement>('[data-role="protocol"]')!.textContent=disturbed?'扰动验收：8个未见位置×2时刻，共16样本；本次只复播tick60。成功须冲击后持续≥30步且在60步内恢复。':'静态验收：8个未见位置；本次仅复播所选位置。';
    tickText.textContent = `步数 ${progressed} / 180`;
    pauseButton.disabled = busy || ended;
    pauseButton.textContent = running ? '暂停' : '继续';
    runButton.disabled = busy || running || ended;
    restartButton.disabled = busy;
    trainButton.disabled = busy;
    arenaButton.disabled=busy||!readContactTraining(sessionStorage);
    kindSelect.disabled = busy || running;
    experimentSelect.disabled=busy||running;
    offsetSelect.disabled = busy || running;
    modeSelect.disabled = busy || running;
    const trained = learnedParameters.get(activeKind);
    modeSelect.querySelector<HTMLOptionElement>('option[value="learned"]')!.disabled = !trained;
    value('score').textContent = `评分：${experience.score.toFixed(4)}（内部传感器）`;
    value('sensor-contact').textContent = `内部双侧接触：${experience.bilateralTicks} 步；最长 ${experience.longestBilateralTicks} 步`;
    value('params').textContent = `当前参数：${parameters.map(n => n.toFixed(3)).join(', ')}`;
    value('external-contact').textContent = `目标双侧受力连续步数：${result.longestBilateralTicks}；累计 ${result.bilateralTicks}${experimentSelect.value==='disturbed'?`；冲击后最长 ${result.postLongestBilateralTicks}；恢复 ${result.recoveryTicks} 步`:''}`;
    value('energy').textContent = `实际能量消耗：${result.energyJ.toFixed(2)} J`;
    value('gate').textContent = ended
      ? passed
        ? `单次样本达门槛；${gateLabel}总门槛尚未判定`
        : `单次样本未达门槛；${gateLabel}总门槛尚未判定`
      : '未运行';
  }

  function draw(): void {
    renderer.clearWorldVisuals();
    renderer.setDaylightFactor(1);
    for (const surface of trial.world.environment.listSurfaces()) {
      renderer.addEnvironmentSurface(surface.id, surface.halfExtents,
        { position: surface.position, rotation: surface.rotation ?? { x: 0, y: 0, z: 0, w: 1 } }, 0x485862);
    }
    for (const entity of trial.world.listEntities()) {
      const blueprint = trial.world.readBlueprint(entity.id);
      const body = trial.world.getPhysicsBody(entity.id);
      for (const part of blueprint.parts) {
        const handle = body.partHandles.get(part.id);
        if (handle === undefined) continue;
        renderer.addPart(handle, part.geometry, entity.id === 'sample' ? 0xe0aa70 : 0x86b9ad);
        renderer.setPose(handle, body.readPartPose(part.id));
      }
    }
  }

  async function installTrial(autoRun: boolean): Promise<void> {
    const requested=++revision;
    activeKind = kindSelect.value as ContactTrialKind;
    renderer.frameContactSubject(activeKind==='machine'?-.25:-.45);
    parameters = modeSelect.value === 'learned'
      ? learnedParameters.get(activeKind) ?? CONTACT_INITIAL_PARAMETERS
      : CONTACT_INITIAL_PARAMETERS;
    const offset = CONTACT_TEST_OFFSETS[Number(offsetSelect.value)] ?? CONTACT_TEST_OFFSETS[0];
    const replacement = await createContactLearningTrial(activeKind, offset, parameters,false,experimentSelect.value==='disturbed'?contactTestDisturbances(offset)[0]:undefined);
    if(requested!==revision){replacement.physics.dispose();return;}
    trial?.physics.dispose();trial=replacement;
    trial.world.paused = true;
    running = autoRun;
    ended = false;
    draw();
    status.textContent = `${kindLabels[activeKind]} · ${modeSelect.value === 'learned' ? '冻结训练参数' : '固定基线'} · 等待运行`;
    refresh();
  }

  async function runTraining(): Promise<void> {
    busy = true;
    running = false;
    status.textContent = `正在为“${kindLabels[kindSelect.value as ContactTrialKind]}”搜索有限参数候选；训练只读取本体传感经验。`;
    refresh();
    try {
      // Start on a later task so the status update is painted before simulation work begins.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const kind = kindSelect.value as ContactTrialKind;
      const train=experimentSelect.value==='disturbed'?trainDisturbedContact:trainContactSkill;
      const learned = await train(kind,(done,total)=>{status.textContent=`正在训练 ${done}/${total}：只读本体传感反馈，未见测试位置不参与选择。`;});
      learnedParameters.set(kind, [...learned.parameters]);
      if(kind==='extended-body' && experimentSelect.value==='disturbed')saveContactTraining(sessionStorage,learned);
      modeSelect.value = 'learned';
      status.textContent = `训练结束：已冻结参数 [${learned.parameters.map(n => n.toFixed(3)).join(', ')}]；现在复播一个未见偏移，外部接触仍单独测量。`;
      busy = false;
      await installTrial(true);
    } catch (error) {
      busy = false;
      status.textContent = `训练失败：${error instanceof Error ? error.message : String(error)}`;
      refresh();
    }
  }

  runButton.addEventListener('click', () => {
    if (ended) return;
    running = true;
    status.textContent = `${kindLabels[activeKind]} · ${modeSelect.value === 'learned' ? '冻结训练参数' : '固定基线'} · 正在运行`;
    refresh();
  });
  pauseButton.addEventListener('click', () => {
    if (ended || busy) return;
    running = !running;
    status.textContent = running ? '继续运行' : '已暂停';
    refresh();
  });
  restartButton.addEventListener('click', () => { void installTrial(false); });
  arenaButton.addEventListener('click',()=>{location.hash='arena-learning';});
  trainButton.addEventListener('click', () => { void runTraining(); });
  experimentSelect.addEventListener('change',()=>{modeSelect.value='baseline';learnedParameters=new Map();if(experimentSelect.value==='disturbed')kindSelect.value='extended-body';void installTrial(false);});
  kindSelect.addEventListener('change', () => { modeSelect.value = 'baseline'; void installTrial(false); });
  offsetSelect.addEventListener('change', () => { void installTrial(false); });
  modeSelect.addEventListener('change', () => { void installTrial(false); });
  panel.querySelector<HTMLButtonElement>('[data-action="home"]')!.addEventListener('click', () => { location.hash = ''; });
  addEventListener('hashchange', () => { if (location.hash !== '#contact-learning') location.reload(); });

  await installTrial(false);
  function frame(): void {
    if (running && trial) {
      trial.step();
      if (trial.world.tick >= 180) {
        running = false;
        ended = true;
        status.textContent = `本次 180 步复播结束。单次样本不构成${experimentSelect.value==='disturbed'?'16样本（8位置×2时刻）':'8位置'}的整体验收。`;
      }
      refresh();
    }
    if (trial) {
      for (const entity of trial.world.listEntities()) {
        const body = trial.world.getPhysicsBody(entity.id);
        for (const part of trial.world.readBlueprint(entity.id).parts) {
          const handle = body.partHandles.get(part.id);
          if (handle !== undefined) renderer.setPose(handle, body.readPartPose(part.id));
        }
      }
    }
  }
  return { frame, destroy: () => { running=false;trial.physics.dispose();panel.remove(); } };
}
