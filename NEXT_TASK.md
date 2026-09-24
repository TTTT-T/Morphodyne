# NEXT TASK — v0.2 Phase 9：通用结构载荷（Universal Structural Load）

v0.1 基础架构视为已完成并接受。默认四足 Agent 的可玩性、步态调参、UI 美化不再作为主线阻塞项；这些问题保留为非阻塞技术债。

本 Phase 开始 v0.2。

## Phase 9 目标

把 Morphodyne 当前主要依赖“碰撞冲量”的 Damage，扩展为能够接收和处理真实物理结构载荷的通用系统。

核心因果链：

```text
Part / Connection / Actuator
        ↓
     Rapier Physics
        ↓
   Physical Load
        ↓
Structural Response
        ↓
Damage / Deformation / Separation
```

目标不是增加更多预设能力，而是让结构因为实际承受的力和扭矩自然产生后果。

## 第一版范围

只实现足够通用、足够简单的三类载荷：

1. 瞬时冲量 / Impact
2. 持续力 / Force
3. 扭矩 / Torque

可以设计统一的 `StructuralLoad` 或等价抽象，具体形式根据现有架构决定。

Damage 不应再只依赖 `readPartImpactImpulse()`。

需要研究 Rapier 当前能够直接提供哪些：

- joint reaction force / torque；
- constraint impulse；
- contact / solver impulse；
- 或可由当前物理状态可靠推导的等价量。

如果 Rapier API 无法直接提供理想数据，可以在 PhysicsAdapter 层实现第一版近似，但必须满足：

- 数据来自实际物理状态；
- 所有 Entity 使用相同规则；
- 不根据“动物、机器、腿、牙齿”等语义判断；
- 不通过预设 Damage 结果绕过物理。

## 必须保持的原则

禁止新增任何语义能力捷径，例如：

- `isAnimal`
- `isLeg`
- `isTooth`
- `biteDamage`
- `attackPower`
- `canBreak`
- `canWalk`
- 或任何等价字段 / 分支。

不要为当前四足 Agent 写特殊路径。

不要新增 Brain、Skill、LLM、Jev、RL、复杂规划功能。

不要进入有限元、软体模拟、裂纹传播、复杂疲劳、热力学。

第一版允许低精度，但不能绕过核心因果规则制造结果。

## 结构损伤

在现有 Damage 系统上扩展，不要建立一套平行 Damage 系统。

材料 / Connection 第一版继续保持简单，可复用或扩展：

- yield threshold；
- ultimate / toughness capacity；
- accumulated deformation / overload。

至少支持：

- 短时强冲击导致破坏；
- 持续超过屈服阈值的载荷逐渐产生结构损伤；
- 扭矩超过结构承载能力后产生损伤或分离。

特别注意：

正常静态载荷不能因为每个 tick 被重复采样，就错误地无限累计伤害。

需要明确区分：

- 瞬时冲量；
- 当前持续载荷；
- 随时间积累的过载效应。

所有量必须记录清楚单位。

## 必须完成的三个物理实验

### Experiment A — Weight Creates Load

构造两个相同的支撑 / 悬挂结构，只改变挂载质量。

要求：

- 更重结构产生更高的真实结构载荷；
- 低载荷保持稳定；
- 达到合理阈值后能够产生屈服或损伤；
- 结果不能由 `mass` 条件分支直接触发；
- 必须通过 Physics → Load → Damage 得出。

### Experiment B — Free Joint vs Stalled Joint

使用相同 Actuator、相同输出，构造：

- 一个可以自由运动的关节；
- 一个因为真实物理阻挡而无法正常运动的关节。

要求：

- 自由关节主要将执行器输出转化为运动；
- 卡死关节产生明显更高的结构载荷；
- 输出足够大或持续足够久时，卡死结构可以发生真实损伤。

禁止：

```text
if stalled => damage
```

必须通过：

```text
Actuator → Physics → Load → Damage
```

得到结果。

### Experiment C — Sustained Pull

构造两个通过 Connection 相连的结构，持续施加相反方向的真实物理力。

要求：

- 能观察 Connection 的持续载荷；
- 低于合理阈值时结构保持完整；
- 超过屈服阈值或持续过载后出现变形 / 损伤 / 断裂；
- 不需要碰撞事件才能造成破坏。

## 架构要求

继续保持现有边界：

- Core 不依赖 Rapier / Three.js；
- PhysicsAdapter 负责把后端物理数据转换成 Morphodyne 可理解的物理量；
- Damage / structural semantics 属于 Morphodyne Core / Simulation，而不是 Rapier；
- WorldRuntime 继续负责统一固定步进与系统组合；
- UI、测试 fixture、Blueprint 模板都不能成为物理真相来源。

如果当前抽象无法合理表达 Structural Load，可以修改 Architecture。

但必须：

1. 先明确说明当前抽象缺失了什么；
2. 选择能够同时适用于 passive structure、machine、Agent 的通用抽象；
3. 不为了某个具体 Demo 引入类型特例。

## 与当前 Agent 的关系

默认四足 Agent 的“站不稳 / 前进后散架”目前不作为 Phase 9 阻塞项。

不要为了本 Phase 花时间美化步态或追求可玩性。

如果 Phase 9 的实现自然影响现有 Agent，则只修复必要回归。

当前 Agent 可以继续作为一个额外结构案例，但 Phase 9 的核心实验不能依赖它。

## 测试要求

新增 Structural Load 的 Core / Physics / integration tests。

至少覆盖：

- passive structure；
- actuated non-Agent structure。

不要只用 quadruped 验证。

同时确保原有碰撞 Damage 路径继续工作。

完成前运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:boundaries
```

需要检查是否出现：

- 测试只验证局部路径，而真实 WorldRuntime 路径没有覆盖；
- fixture 为了测试结果污染默认 Blueprint；
- 通过硬编码阈值针对单个案例；
- Architecture boundary 被绕过。

## 工作方式

这是一个完整 Phase。

不要把它拆成很多次要求用户中间传话。

主代理负责：

- Phase 目标；
- 架构决策；
- 任务分解；
- 集成；
- 最终审查。

可以使用 `gpt6-luna` 子代理完成独立调查、Rapier API 研究、测试或局部实现，但不要创建专门 verifier 子代理。

如果一个任务适合直接完成，就直接完成；不要为了形式强行拆分。

## Phase 9 输出

完成整个 Phase 后：

1. 更新 `docs/ARCHITECTURE_v0.1.md`，或建立更合适的 v0.2 架构文档；
2. 创建 `PHASE9_REPORT.md`；
3. 明确记录 Structural Load 的定义、数据来源和单位；
4. 记录三个实验的定量结果；
5. 记录已知近似和当前无法表示的载荷；
6. 完成完整测试；
7. commit；
8. push Phase 分支；
9. 创建 PR 到 `main`；
10. 停止在评审边界。

不要开始 Phase 10。

## Phase 9 核心验收

**结构必须能够因为它实际承受的力和扭矩而损坏，而不再必须依赖一次碰撞事件。**

如果三个核心实验不能用同一套通用规则成立，则 Phase 9 不通过。
