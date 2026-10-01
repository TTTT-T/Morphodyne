import { LAB_RETURN_KEY, LabLibrary, parseLabDesign, type BlueprintCheck, type LabDesign, type LabExperiment } from './LabDesign';
import type { LabResult } from './LabObservation';

export interface LabPanelActions {
  hasDesign(): boolean;
  capture(name: string): LabDesign;
  restore(design: LabDesign): void;
  experiment(kind: LabExperiment): void;
  run(): void;
  runBriefly(): void;
  pause(): void;
  impulse(): void;
  result(): LabResult;
  validate: BlueprintCheck;
}
export interface LabPanelHandle { refresh(): void; prepareArena(): boolean; }

function element<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  parent.append(el);
  return el;
}

export function mountLabPanel(host: HTMLElement, actions: LabPanelActions): LabPanelHandle {
  const root = element('section', host);
  root.className = 'lab-dashboard';
  root.setAttribute('aria-label', '实验室');
  element('h1', root, 'Morphodyne 实验室');
  element('p', root, '选实验 → 改设计 → 运行 → 看结果 → 重试 → 保存');
  const status = element('p', root);
  status.setAttribute('role', 'status');
  status.className = 'lab-status';
  const safe = (action: () => void, message?: string): void => {
    try { action(); if (message) status.textContent = message; status.dataset.error = 'false'; refresh(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : String(error); status.dataset.error = 'true'; }
  };
  const button = (parent: HTMLElement, label: string, action: () => void): HTMLButtonElement => {
    const el = element('button', parent, label);
    el.type = 'button'; el.addEventListener('click', () => safe(action)); return el;
  };
  const BACKUP_KEY = 'morphodyne.lab.switch-backup.v1';
  const entries = element('div', root); entries.className = 'lab-actions';
  for (const [kind, label] of [['grip', '夹持实验'], ['lift', '起重实验'], ['damage', '结构损伤']] as const) {
    button(entries, label, () => {
      // Preserve the current declaration before switching to a new starter experiment.
      if (actions.hasDesign()) sessionStorage.setItem(BACKUP_KEY, JSON.stringify(actions.capture('切换前设计')));
      actions.experiment(kind);
      status.textContent = `已准备${label}；切换前的设计可恢复。`;
      refresh();
    });
  }
  const editor = host.querySelector<HTMLElement>('.god-sandbox');
  if (editor) {
    editor.hidden = window.matchMedia('(max-width: 900px)').matches;
    const toggle = button(entries, '', () => {
      editor.hidden = !editor.hidden;
      toggle.textContent = editor.hidden ? '打开结构编辑' : '收起结构编辑';
    });
    toggle.textContent = editor.hidden ? '打开结构编辑' : '收起结构编辑';
  }
  const guide = element('p', root); guide.className = 'lab-guide';
  const controls = element('div', root); controls.className = 'lab-actions';
  button(controls, '运行 / 继续试验', () => { actions.run(); status.textContent = '运行中：控制只请求执行器输出，物理决定结果。'; });
  button(controls, '运行约3秒后暂停', () => { actions.runBriefly(); status.textContent = '运行约 3 模拟秒后自动暂停；实际时长以读数为准。'; });
  button(controls, '暂停观察', () => { actions.pause(); status.textContent = '已暂停，可修改设计、记录结果或重新试验。'; });
  const impactButton = button(controls, '施加冲击并单步', actions.impulse);
  const result = element('pre', root); result.className = 'lab-result';
  const feedback = element('p', root);
  const resultDetails = element('details', root);
  element('summary', resultDetails, '各部件真实读数');
  const rows = element('pre', resultDetails);
  const retry = element('div', root); retry.className = 'lab-actions';
  button(retry, '按我的设计重新试验', () => { actions.restore(actions.capture(name.value || '未命名设计')); status.textContent = '按声明设计新建试验；保留载荷、控制和初始能量，不续接速度/损伤/时间。'; });
  button(retry, '恢复原始模板', () => {
    sessionStorage.setItem(BACKUP_KEY, JSON.stringify(actions.capture('恢复模板前设计')));
    actions.experiment(actions.capture('当前设计').experiment);
    status.textContent = '已恢复原始模板；原设计可用“恢复切换前设计”找回。';
  });
  button(retry, '恢复切换前设计', () => {
    const raw = sessionStorage.getItem(BACKUP_KEY);
    if (!raw) throw new Error('尚无切换前设计');
    actions.restore(parseLabDesign(raw, actions.validate));
    status.textContent = '已恢复此前声明设计，作为新试验。';
  });
  element('small', root, '先应用右侧修改再保存或重试。重试/读取重新生成全部物体并补充所声明的初始能量；不保存运行状态。');
  const comparisons: { label: string; result: LabResult; design: LabDesign }[] = [];
  const compare = element('details', root);
  element('summary', compare, '记录与比较两次试验');
  button(compare, '记录这次结果', () => {
    const measured = actions.result();
    if (!measured.samples) throw new Error('请先运行或单步，再记录实际结果');
    comparisons.push({ label: name.value || '未命名设计', result: measured, design: actions.capture(name.value || '未命名设计') });
    if (comparisons.length > 2) comparisons.shift();
    comparisonRows.replaceChildren();
    for (const [index, record] of comparisons.entries()) {
      element('p', comparisonRows, `${index + 1} · ${record.label} · ${summary(record.result)}`);
      const detail = element('details', comparisonRows);
      element('summary', detail, '起始条件 / 记录时声明设计');
      element('pre', detail, record.result.conditions + (record.result.changedDuringTrial ? '\n当前与起始声明不同；不能将差异归因单一变量。' : '\n记录时声明与起始相同；运行期间可能曾调整。'));
      element('pre', detail, JSON.stringify(record.design, null, 2));
    }
  });
  const comparisonRows = element('div', compare);
  const libraryGroup = element('details', root); libraryGroup.open = true;
  element('summary', libraryGroup, '我的作品（刷新后仍在）');
  const nameLabel = element('label', libraryGroup, '作品名称');
  const name = element('input', nameLabel); name.value = '我的夹持实验'; name.maxLength = 120;
  name.setAttribute('aria-label', '作品名称');
  const library = new LabLibrary({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, actions.validate);
  const saved = element('select', libraryGroup); saved.setAttribute('aria-label', '已保存作品');
  const reloadList = (): void => {
    const value = saved.value;
    saved.replaceChildren();
    for (const design of library.list()) { const option = element('option', saved, design.name); option.value = design.name; }
    if (Array.from(saved.options).some(o => o.value === value)) saved.value = value;
  };
  const libraryActions = element('div', libraryGroup); libraryActions.className = 'lab-actions';
  button(libraryActions, '保存作品', () => { library.save(actions.capture(name.value)); reloadList(); saved.value = name.value.trim(); status.textContent = '作品已保存在本浏览器，包括所有物体与独立载荷。同名保存会更新作品。'; });
  button(libraryActions, '读取作品为新试验', () => {
    const design = library.list().find(d => d.name === saved.value);
    if (!design) throw new Error('请先选择已保存作品');
    actions.restore(design); name.value = design.name; status.textContent = '已读取完整设计并建立新试验。';
  });
  let deleted: LabDesign | undefined;
  button(libraryActions, '删除选中作品', () => {
    const design = library.list().find(d => d.name === saved.value);
    if (!design) throw new Error('请先选择已保存作品');
    library.delete(design.name); deleted = design; reloadList(); status.textContent = '已删除作品；本页可撤销。当前试验未改变。';
  });
  button(libraryActions, '撤销删除', () => { if (!deleted) throw new Error('本页没有可撤销删除的作品'); library.save(deleted); deleted = undefined; reloadList(); status.textContent = '删除已撤销。'; });
  button(libraryActions, '导出作品文件', () => {
    const design = actions.capture(name.value);
    const url = URL.createObjectURL(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }));
    const link = element('a', root); link.href = url; link.download = 'morphodyne-lab.json'; link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '已导出全部声明设计；文件不含运行状态。';
  });
  const importLabel = element('label', libraryGroup, '导入作品文件');
  const file = element('input', importLabel); file.type = 'file'; file.accept = '.json,application/json'; file.setAttribute('aria-label', '导入作品文件');
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; if (!selected) return;
    try {
      if (selected.size > 2_000_000) throw new Error('作品文件超过 2 MB 限制');
      const design = parseLabDesign(await selected.text(), actions.validate);
      safe(() => { actions.restore(design); name.value = design.name; status.textContent = '文件验证通过，已读取为新试验；可另行保存到作品库。'; });
    } catch (error) { status.textContent = `导入失败，当前作品保留：${error instanceof Error ? error.message : String(error)}`; status.dataset.error = 'true'; }
    file.value = '';
  });
  // Text alternative also permits inspectable file-content roundtrips without a picker.
  const transfer = element('details', libraryGroup);
  element('summary', transfer, '文件内容导入（可选）');
  const json = element('textarea', transfer); json.setAttribute('aria-label', '作品文件内容');
  button(transfer, '导入文件内容', () => {
    const design = parseLabDesign(json.value, actions.validate);
    actions.restore(design); name.value = design.name; status.textContent = '已验证文件内容并建立新试验。';
  });
  button(transfer, '查看导出文件内容', () => { json.value = JSON.stringify(actions.capture(name.value), null, 2); });
  safe(reloadList);

  function summary(r: LabResult): string { return `${r.seconds.toFixed(2)} s · 能量消耗 ${r.energyJ.toFixed(2)} J · 受损 ${r.damagedParts} · 破裂 ${r.fractures} · 连接分离 ${r.separated}`; }
  function refresh(): void {
    try { renderResult(); }
    catch (error) { status.textContent = `设计读数暂不可用：${error instanceof Error ? error.message : String(error)}`; status.dataset.error = 'true'; }
  }
  function renderResult(): void {
    if (!actions.hasDesign()) { result.textContent = '世界中没有物体；选择实验入口建立新试验。'; guide.textContent = ''; feedback.textContent = ''; rows.textContent = ''; return; }
    const design = actions.capture(name.value || '未命名设计');
    const kind = design.experiment;
    guide.textContent = kind === 'grip' ? '① 运行已预设的左右夹爪 +1/−1；看独立方块高度和接触。② 暂停，在右侧选择独立方块，改摩擦系数。③ 按我的设计重试并比较。'
      : kind === 'lift' ? '① 运行拉力 1；看悬臂高度变化。② 暂停，在右侧改拉力端点一 Y（默认 +0.55 m），或质量。③ 按我的设计重试。'
      : kind === 'damage' ? '① 施加冲击并单步；观察连接分离与执行器失效。② 暂停，在右侧改连接抗冲击阈值（默认 1 N·s），重试同样 3 N·s。③ 也可修复连接。'
      : '在右侧修改声明结构与控制，运行后观察真实结果。';
    impactButton.hidden = kind !== 'damage';
    const r = actions.result();
    const focus = r.parts.find(p => p.label.includes('payload-body')) ?? r.parts.find(p => p.label.includes('arm')) ?? r.parts[0];
    result.textContent = summary(r) + (focus ? `\n${focus.label}\n高度 ${focus.height.toFixed(3)} m · 高度变化 ${focus.rise.toFixed(3)} m\n位移 ${focus.displacement.toFixed(3)} m · 当前接触点 ${focus.contacts}\n采样峰值外部力 ${focus.sampledPeakForceN.toFixed(2)} N` : '');
    rows.textContent = r.parts.map(p => `${p.label}: Y=${p.height.toFixed(3)} m ΔY=${p.rise.toFixed(3)} m 位移=${p.displacement.toFixed(3)} m 接触=${p.contacts}`).join('\n');
    feedback.textContent = r.separated ? `已观察到 ${r.separated} 条连接分离，${r.inactiveActuators} 个执行器失效；查看结构读数，可修复或按设计重新试验。`
      : r.fractures ? '已观察到材料破裂。当前读数不能单独证明是哪种载荷条件导致。'
      : !r.samples ? '物理暂停；点击运行开始。右侧可修改结构与手动信号。'
      : kind === 'damage' ? '本次采样未观察到连接分离；可比较同样冲击下的材料和连接容量。'
      : focus?.contacts ? '已观察到真实接触；比较同样模拟时长下的高度变化，不能仅凭接触判定夹持成功。'
      : '当前采样无接触；检查信号、安装点与目标位置，暂停后调整再重试。';
  }
  refresh();
  return { refresh, prepareArena: () => {
    let ok = false;
    safe(() => { sessionStorage.setItem(LAB_RETURN_KEY, JSON.stringify(actions.capture(name.value || 'Arena前设计'))); ok = true; }, '设计已保留；返回沙盒将作为新试验恢复。');
    return ok;
  } };
}
