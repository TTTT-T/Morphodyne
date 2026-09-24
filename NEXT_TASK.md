# NEXT TASK — v0.2 Phase 10：通用拉力执行器（Tension Actuator）

Phase 9 已通过并合并。Morphodyne 现在已经能够把实际物理载荷（Impact / Force / Torque）送入统一 Structural Damage 路径。

Phase 10 不扩展 Brain，也不继续四足步态调参。

本 Phase 的目标是补上下一块通用机械基础：**一种不直接“命令关节产生扭矩”，而是在两个真实安装点之间产生拉力的执行器。**

它必须能够同时表达未来的：

- 肌肉；
- 肌腱牵引；
- 拉索；
- 绞盘；
- 简单线性拉力机构。

这些名称都只是未来内容层解释；Core 中不要出现生物/机器语义类型。

---

## Phase 10 核心目标

新增一种通用 Tension Actuator。

因果链必须是：

```text
ControlSignal
    ↓
Tension Actuator
    ↓
两个真实 attachment points 之间产生等大反向拉力
    ↓
Rapier Physics
    ↓
结构的几何、力臂、质量、关节约束决定运动
    ↓
Phase 9 Structural Load
    ↓
必要时产生 Damage / Separation
```

禁止直接把 Tension Actuator 转换成：

```text
joint angle
joint target
magic torque
ability result
```

它只能施加真实物理力。

---

# 1. 通用数据模型

在现有 Actuator 抽象上扩展，而不是建立第二套平行控制系统。

需要支持至少两类执行器：

- 现有 Joint Actuator；
- 新的 Tension Actuator。

具体 TypeScript 设计由实现者结合现有代码决定，可以使用 discriminated union 或其他清晰的通用模型。

Tension Actuator 至少需要表达：

- actuator id；
- 两个 Part；
- 两个 Part 各自局部坐标系中的 attachment point；
- 最大拉力（N）；
- 可复用现有 response time 机制；
- 必要的、纯物理的长度参数（如果实现确实需要）。

不要加入：

- muscleType；
- tendonType；
- biologicalStrength；
- canPull；
- limb；
- jaw；
- 或任何具体生物/机械语义。

Blueprint 描述的是结构和执行器安装方式，不描述“能力”。

---

# 2. 拉力的物理规则

第一版 Tension Actuator 必须遵守：

- 只能沿两个 attachment points 当前世界位置之间的连线施力；
- 两端受到等大、方向相反的力；
- 力作用在 attachment point，而不是默认作用于质心；
- 因为作用点不同，自然产生力矩；
- 最大输出由 `maxOutput`（N）限制；
- 输出变化继续遵守现有 actuator response time；
- physics 决定最终是否移动、旋转、卡死或损坏。

第一版以“主动收缩产生张力”为主。

不要模拟：

- Hill muscle model；
- 肌纤维生理；
- 复杂弹性肌腱；
- 神经激活；
- 疲劳；
- 热；
- 液压细节。

如果需要处理 slack / 零距离 / 极短距离等数值边界，使用明确且通用的物理规则并写测试。

---

# 3. ControlSignal

继续使用现有 ControlSignal 作为统一控制输入。

不要为 Tension Actuator 建立新的控制协议。

需要定义并文档化 ControlSignal 对 Tension Actuator 的含义。

推荐语义：

```text
0      = 无主动张力
1      = maxOutput
```

由于当前 ControlSignal 支持 [-1, 1]，如何处理负值由实现者选择，但必须：

- 行为明确；
- 不允许负值变成“推力”；
- 不偷偷把 tension actuator 变成双向线性马达；
- 有测试覆盖。

如果认为现有 ControlSignal 抽象需要小幅泛化，可以调整，但不要破坏统一控制路径。

---

# 4. PhysicsAdapter

Rapier 细节必须继续封装在 PhysicsAdapter 内。

如果当前接口不足，可新增通用能力，例如：

- 对 Part 的某个世界/局部作用点施加力；
- 查询 attachment point 世界位置；
- 必要时查询作用点速度。

这些接口必须是通用 Physics 能力，不能命名成 muscle API。

Three.js / UI 不参与物理计算。

---

# 5. Actuator Runtime

不要复制出：

```text
JointActuatorRuntime
MuscleRuntime
CableRuntime
WinchRuntime
```

形成多套重复执行链。

Phase 10 应借机整理成能够承载多种 actuator 的统一 Runtime。

可以：

- 泛化现有 `JointActuatorRuntime`；
- 重命名为更通用的 `ActuatorRuntime`；
- 或使用内部 actuator handler。

但固定步进中的控制路径仍然应该只有一条：

```text
ControlSignal → ActuatorRuntime → PhysicsAdapter
```

现有 Joint Actuator 行为必须保持。

---

# 6. 与 Phase 9 Structural Load 集成

这是 Phase 10 的关键要求。

Tension Actuator 施加的力必须是正常 Rapier 物理力。

它导致的：

- joint reaction；
- connection force；
- connection torque；
- obstruction load；

都应该自然被 Phase 9 的 load measurement 看见。

禁止直接调用 Damage：

```text
TensionActuator → Damage
```

必须经过：

```text
TensionActuator
→ Physics
→ Structural Load
→ Damage
```

---

# 7. 必须完成的物理实验

至少实现以下四个实验，优先使用 WorldRuntime 的真实固定步进路径。

## Experiment A — Lever Arm Creates Rotation

构造一个可转动结构。

使用相同：

- Part；
- Joint；
- Tension force；
- 控制信号。

只改变 Tension Actuator attachment point 相对旋转轴的距离。

要求：

- 两个结构收到相同最大拉力；
- 更大的物理力臂产生明显不同的旋转响应；
- 不允许通过 actuator 参数直接写 torque 差异；
- 差异必须由 attachment geometry × force 自然产生。

这是 Phase 10 最核心实验。

---

## Experiment B — Geometry Changes Capability

构造两个外观/部件基本相同的结构。

只改变 Tension Actuator 的安装位置或拉力方向。

要求：

- 一个结构能有效驱动目标运动；
- 另一个因为几何位置差异产生明显更弱或不同的运动；
- 两者使用相同 actuator maxOutput；
- 不存在 `canMove` / `efficiencyBonus` 等语义参数。

目标是证明：

**执行器相同，结构不同，能力就不同。**

---

## Experiment C — Blocked Pull Produces Structural Load

让 Tension Actuator 拉动一个结构：

- 第一种情况可自由运动；
- 第二种情况被真实物理障碍阻挡。

要求：

- blocked case 产生明显结构载荷；
- 输出足够大或持续足够久时，可以通过 Phase 9 Damage 路径损坏/断裂；
- 自由结构不应因为同样控制输入直接获得相同 Damage；
- 禁止 `if blocked => damage`。

---

## Experiment D — Tension Does Not Push

验证：

- 0 输出不产生主动张力；
- 正输出产生拉力；
- 负输入无论采用 clamp / reject / other explicit rule，都不能产生反向推力；
- 极短 attachment 距离不会产生 NaN / Infinity / 爆炸力。

---

# 8. Energy 处理

Phase 11 才会正式扩展 Energy / Power 系统。

所以 Phase 10 不要顺便实现：

- 电池；
- 燃料；
- ATP；
- 热；
- 完整效率模型；
- 疲劳。

但现有 `EnergySource.availablePowerWatts` 不能被无意绕过。

如果为了支持 Tension Actuator 必须泛化当前 actuator power accounting，可以做最小必要调整，并在报告中说明第一版机械功率如何估算。

不要让这个子问题膨胀成 Phase 11。

---

# 9. Construction / Blueprint

Tension Actuator 必须成为 Blueprint / Construction Runtime 可表达的通用结构组件。

至少保证：

- Blueprint 可以声明；
- validateBlueprint 可以验证；
- runtime spawn 可以创建；
- serialize / parse 不丢失；
- Construction Runtime 的通用增删 actuator 路径不会假设 actuator 一定绑定 Connection。

不要求 Phase 10 大改 God Sandbox UI。

如果现有 UI 因 actuator 类型假设发生回归，只做必要兼容。

---

# 10. 架构边界

继续保持：

- Core 不依赖 Rapier；
- Core 不依赖 Three.js；
- PhysicsAdapter 隔离物理后端；
- Actuator 只提供物理输入，不提供结果；
- Physics 决定运动；
- Damage 读取物理载荷；
- Agent 不是 World / Actuator 的必要组成。

禁止具体内容污染 Core。

不要为四足 Agent 或未来动物写特例。

---

# 11. 测试与回归

至少新增：

- Tension Actuator Core validation；
- PhysicsAdapter point-force tests；
- WorldRuntime integration experiments；
- Construction / Blueprint compatibility tests（如相关类型发生变化）。

并确保：

- Phase 9 Structural Load 实验继续通过；
- 现有 Joint Actuator 行为继续通过；
- passive Entity / non-Agent machine 仍然是一等公民。

完成前运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:boundaries
```

---

# 12. 工作方式

这是一个完整 Phase。

不要要求用户在多个小步骤之间传话。

主代理负责：

- 调研；
- 架构决定；
- 实现；
- 测试；
- 集成；
- 自审。

可以使用 `gpt6-luna` 子代理完成边界清晰的调查或实现任务，但主代理必须亲自负责整体架构和最终整合。

不要建立专门 verifier 子代理。

如果没有真正的架构阻塞，直接完成整个 Phase。

---

# 13. Phase 10 输出

完成后：

1. 更新 `docs/ARCHITECTURE_v0.2.md`；
2. 创建 `PHASE10_REPORT.md`；
3. 记录 Tension Actuator 的物理定义和单位；
4. 记录 attachment point 的坐标语义；
5. 记录负 ControlSignal 的明确规则；
6. 记录四个实验的定量结果；
7. 记录 Phase 9 Structural Load 如何观测 Tension Actuator 造成的载荷；
8. 跑完整测试；
9. commit；
10. push Phase 分支；
11. 创建 PR 到 `main`；
12. 停止在评审边界。

不要开始 Phase 11。

---

# Phase 10 核心验收

**同样大小的拉力，仅仅因为安装位置、力臂和结构不同，就必须产生不同的物理能力。**

如果 Tension Actuator 最终只是换一种方式直接给 joint 写 torque，则 Phase 10 不通过。
