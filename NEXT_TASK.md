# NEXT TASK — v0.1.2 默认 Agent 可玩性稳定

用户实际试玩反馈：默认 Agent 点击“前进”后只晃动几下，随后倒地并发生结构分离。v0.1 的因果链虽然已经验证，但默认 Agent 仍是偏“验收夹具”的状态，不具备基本可玩性。

本任务只解决默认 Agent 的站立、前进和正常跌倒稳定性。不要扩展新功能，不进入 v0.2。

## 已确认的两个高优先级原因

### 1. 默认 Blueprint 混入了损伤实验专用脆弱参数

`createActiveBlueprint()` 当前有：

- `connection-0-a.strengthImpulseNs = 1`
- 其他同类连接约为 `100`

这条 1 N·s 连接来自早期 Damage 验证需求，不应继续存在于默认可玩 Agent。

要求：

- 默认 `createActiveBlueprint()` 使用正常一致的结构强度；
- 如果 Damage / Adaptation 测试仍需要“一击可断”的连接，请在测试/专用 fixture 中显式创建脆弱版本；
- 不要为了测试方便再次污染默认角色。

### 2. 默认场景控制器调参明显偏实验性质

当前主场景大致使用：

- `standingGain: 0.01`
- `standingDampingGain: 0`
- `jointPositionGain: 3`
- `jointVelocityGain: 0.6`
- `turnGain: 0`

先用实际 physics/browser 验证重新调参，不要只凭感觉改常量。

目标是：

- 能稳定站立；
- 点“前进”后确实前进，而不是只抽动；
- 普通运动/普通跌倒不会直接把结构震碎；
- 强外部冲击仍然能够造成真实损伤。

## 调试原则

不要通过这些方式伪造可玩性：

- 禁用 Damage；
- 行走时无敌；
- `if moving => no damage`；
- 直接修改 transform；
- 给 Agent 加 `canStand` / `canWalk`；
- 对 Agent 使用特殊物理规则。

仍然必须走：

`Controller → Actuator → Rapier → Contact/Load → Damage`

## 需要做的工作

1. 把默认 Agent 与“脆弱 Damage 测试 fixture”分开。
2. 测量正常站立、前进、摔倒时实际连接/接触冲量，再据此校准：
   - Connection strength；
   - Material yield/toughness；
   - Actuator max output（如确有需要）。
3. 调整默认场景 ActiveBodyController 参数和步态输出，使其至少达到基本稳定。
4. 默认启动时优先进入稳定“站立”状态。
   - 建议默认不要让 Brain 在用户还没操作时自行改变运动意图；
   - 自动 Agent 模式可以继续保留，由用户主动开启。
5. 确认“前进”确实产生可见位移，而不是原地晃。
6. 保留“冲击 Agent 测试部件”或 God Sandbox 的冲击功能，用更明显的强外力验证 Damage 仍然有效。
7. 现有 Phase 8 Damage/Adaptation 测试如依赖脆弱连接，改成显式专用 fixture，不降低验证强度。

## 验收

用 Mac 浏览器和自动测试证明：

### A. 站立
- 重置场景后不操作；
- 连续运行至少 10 秒；
- Agent 不发生 Connection separation；
- 不自行明显翻倒；
- 核心保持基本直立。

### B. 前进
- 从稳定站立开始点击“前进”；
- 连续运行至少 8–10 秒；
- Agent 有清晰的前向位移（建议核心至少 0.5 m，若结构尺度证明需要不同阈值，可在报告中说明）；
- 期间无结构分离；
- 不能靠直接改位置。

### C. 普通跌倒不等于粉碎
- 允许 Agent 因控制不完美摔倒；
- 普通自身运动导致的跌倒不应立即造成多连接连锁分离；
- 如果实际冲量表明某个跌倒足以造成少量损伤，可以保留，但不能出现“按前进几秒就散架”。

### D. 强冲击仍能损坏
- 使用明确强于普通运动的外力；
- 至少一个专用损伤测试能够产生 fracture / separation；
- Damage 因果链继续有效。

### E. 回归
- `npm test`
- `npm run typecheck`
- `npm run build`
- 浏览器 smoke
- 不破坏 v0.1.1 中文 UI。

## 输出

完成后：

- 写简短 `V0_1_2_PLAYABILITY_REPORT.md`，记录：
  - 正常运动实际测得的典型冲量范围；
  - 最终采用的结构强度/控制器参数；
  - 站立与前进实测结果；
  - 强冲击 Damage 结果。
- push 一个分支并创建 PR 到 `main`；
- 停止，不开始 v0.2。
