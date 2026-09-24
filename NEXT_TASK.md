# NEXT TASK — v0.2 Phase 12：结构产生能力验证（Capability Emergence Validation）

Phase 11 已通过并合并。

当前 Morphodyne 已具备：

- 通用 Part / Material / Connection；
- Joint Actuator；
- Tension Actuator；
- attachment point / lever arm；
- finite Energy / shared Power；
- Rapier Physics；
- Structural Load；
- Damage / Separation；
- Construction Runtime；
- WorldRuntime。

Phase 12 不新增一套“能力系统”。

本 Phase 的目标是验证 Morphodyne 最核心的命题：

> **Entity 没有预定义能力；能力来自结构、执行器、能量、材料、环境与物理约束的组合。**

也就是说，本 Phase 主要是**集成验证 + 构造实验**，不是继续堆 Core 概念。

---

## 1. 最重要的禁止项

不要新增：

- `canLift`
- `canGrip`
- `canMove`
- `canWalk`
- `canPush`
- `canCarry`
- `gripStrength`
- `liftCapacity`
- `movementSpeed`
- `attackPower`
- `machineType`
- `animalType`
- 任何等价的语义能力字段。

不要在 Core 中创建：

```text
Capability = { lift: ..., grip: ..., move: ... }
```

作为世界真相。

在 Morphodyne 中，“能力”应当是**观察到的结果**，不是 Entity 身上的属性。

例如：

- 举起了 5 kg → 实验结果；
- 夹住物体 3 秒 → 实验结果；
- 推动目标 0.8 m → 实验结果。

而不是：

```text
entity.liftCapacity = 5
entity.canGrip = true
```

---

# 2. Phase 12 的定位

不要新增重大 Physics 系统。

优先复用已有：

```text
Construction
→ Structure
→ Actuator
→ Energy
→ Physics
→ Load
→ Damage
```

如果实验暴露一个真正缺失的**通用物理接口**，允许做最小扩展。

但每次扩展必须回答：

1. 为什么现有通用规则无法表达？
2. 这个抽象是否同时适用于机器和未来生物结构？
3. 是否只是为了让某个实验通过？

如果只是为了实验结果，禁止加入。

---

# 3. Capability 的定义方式

Phase 12 中可以创建测试/工具层的：

```text
CapabilityProbe
TaskMetric
ExperimentMeasurement
```

或等价工具，用于测量物理结果。

这些只能是：

- test/tool measurement；
- debug observation；
- report evidence。

不能成为 Core Entity 属性。

例如允许：

```text
measuredLiftHeight
payloadDisplacement
holdDuration
objectDropped
energyConsumed
connectionDamage
```

不允许：

```text
entity.capabilities.lift = true
```

---

# 4. 必须完成的实验

至少完成以下四组实验。

所有关键实验必须尽量通过：

```text
WorldRuntime
+ ConstructionRuntime
+ real Rapier step
```

完成。

禁止通过直接修改 transform / pose 得到结果。

---

## Experiment A — Structure Changes Lifting Capability

构造两个使用相同：

- 材料；
- actuator；
- maxOutput；
- Energy；
- payload；
- 控制输入；

的 lifting mechanism。

只改变结构几何，例如：

- lever arm 长度；
- actuator attachment point；
- 支点位置。

要求：

- 两个结构对同一 payload 产生明显不同的提升高度或提升能力；
- 一个结构可以成功举起某个 payload，而另一个可能无法达到相同高度；
- 差异必须来自真实 geometry / force / torque；
- 不允许直接设置 lift force bonus。

记录至少：

- payload mass；
- actuator output；
- energy；
- geometry difference；
- 最大高度 / 位移；
- energy consumed；
- peak structural load。

---

## Experiment B — Structure + Friction Creates Gripping

构造一个通用两侧夹持机构。

建议使用：

- Part；
- revolute / prismatic Connection；
- Tension 或 Joint Actuator；
- 普通 contact / friction。

夹持对象必须是一个独立 passive Entity。

要求：

- jaw/夹持结构通过真实接触与摩擦夹住目标；
- 改变结构几何、夹持方向或材料 friction 后，保持结果发生变化；
- 不能使用 weld / teleport / parent / attach target 等作弊方式；
- 不能把被夹物体加入夹具 Blueprint；
- 不能新增 `gripped=true`。

至少比较两个结构/材料方案：

- 一个能在指定时间窗口内保持目标；
- 一个会滑落或无法稳定保持。

“Grip”只由物理测量定义，例如：

- 目标是否保持在空间区域内；
- 目标下落距离；
- contact 状态；
- 持续时间。

---

## Experiment C — Construction Creates Capability

这是 Phase 12 最关键实验。

从一个**不具备目标物理行为的初始结构**开始。

通过 `ConstructionRuntime` 在运行前或明确 construction boundary 中进行通用修改，例如：

- 添加 Part；
- 添加 Connection；
- 添加 Actuator；
- 改 attachment geometry；
- 改材料 / mass。

要求：

修改前：

- 结构无法完成标准任务或表现明显较弱。

修改后：

- 同一个 Entity identity 在经过合法 reconstruction 后表现出新的/更强的物理行为。

例如：

```text
无 actuator 的结构
→ 添加 Tension Actuator
→ 获得实际提升/闭合/牵引结果
```

或者：

```text
错误力臂
→ 调整 attachment point
→ 同样 actuator 输出产生有效运动
```

禁止 Construction Runtime 直接赋予能力。

必须是：

```text
Construction changes structure
→ Physics changes
→ measured outcome changes
```

---

## Experiment D — Damage Causes Functional Loss, Repair Restores It

选择 Experiment A 或 B 中的一个机构。

先测量 intact 状态下的表现。

然后：

- 通过真实 Structural Load / Impact 使一个关键 Connection 损坏或分离；
- 再次运行同一标准任务；
- 测量能力下降；
- 使用现有合法 repair / reconstruction 路径恢复结构；
- 再次运行；
- 测量功能恢复。

要求：

完整链路：

```text
Damage
→ structure changes
→ physical performance falls
```

Repair：

```text
repair/reconstruction
→ structure restored
→ physical performance returns
```

禁止：

```text
if damaged => performance *= 0.5
```

禁止预制 injury debuff。

---

# 5. 额外 Generality Gate

至少证明一个结果不是某个 fixture 的特例。

Phase 12 的实验集合中必须同时包含：

- passive Entity；
- actuated non-Agent Entity；
- 至少一种通过 ConstructionRuntime 修改后的 Entity。

当前 quadruped Agent **不要求参与**。

不要为了 Phase 12 回去调 Agent 步态。

---

# 6. 公平对照要求

实验必须尽量使用 controlled comparison。

比较结构 A / B 时，只改变声明中的目标变量。

例如测试 lever geometry：

保持：

- material；
- mass；
- maxOutput；
- energy；
- control；
- environment；

相同。

只改 geometry。

测试 friction 时，只改 material friction。

报告中明确列出：

```text
Controlled variables
Changed variable
Measured result
```

避免通过同时改多个参数制造“结构差异”。

---

# 7. 防作弊审查

完成前主动扫描以下问题。

禁止：

### 结果分支

```text
if experimentA ...
if isGripper ...
if payloadMass > ...
if blocked ...
if damaged ...
```

来直接决定 outcome。

### 测试识别

Core / Physics / Simulation 中不能出现：

- Phase12；
- experiment 名称；
- fixture id；
- 特定 Blueprint 名称；

用于改变物理逻辑。

### 魔法约束

禁止为了“夹住”：

- 临时建立 rigid joint 到目标；
- 修改 target parent；
- freeze target；
- 设置 kinematic；
- teleport target；
- 直接修改 pose / velocity。

### 语义数值

禁止：

- lift bonus；
- grip multiplier；
- carry capacity；
- locomotion multiplier；
- damage debuff。

所有差异必须能沿通用物理链解释。

---

# 8. 不要提前做的内容

Phase 12 不做：

- Phase 13 Sandbox 大改；
- 动物 Blueprint；
- 真实肌肉模型；
- 牙齿 / 爪 / 攻击系统；
- locomotion overhaul；
- Brain 扩展；
- Jev / LLM / RL；
- ecology；
- evolution；
- energy network；
- thermal；
- fluid overhaul；
- soft body。

如果某个实验必须依赖这些才能完成，优先换一个更基础的实验，而不是扩 Scope。

---

# 9. 可复用 Fixtures

可以新增少量通用 Blueprint / fixture，例如：

- lever mechanism；
- generic gripper；
- generic actuator frame；
- payload。

名称可以描述结构，但不要成为 Core 类型。

例如允许：

```text
createLeverFixture()
createGripperFixture()
```

不允许 Core 出现：

```text
EntityKind.Gripper
EntityKind.Lifter
```

---

# 10. 测试要求

新增 Phase 12 integration tests。

至少覆盖：

- lifting geometry comparison；
- gripping/friction comparison；
- Construction-created capability；
- damage → loss → repair；
- no semantic capability fields；
- existing Phase 9 Structural Load regressions；
- Phase 10 Tension regressions；
- Phase 11 Energy regressions。

完成前运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:boundaries
```

如果新增 test helper / metric helper，它不能被生产 runtime 用来决定结果。

---

# 11. 报告要求

创建：

```text
PHASE12_REPORT.md
```

报告必须包含：

1. 四个实验的结构说明；
2. controlled variables；
3. changed variable；
4. 定量结果；
5. 能量消耗；
6. 关键载荷；
7. 是否损坏；
8. capability 是如何从结果测量出来，而不是被声明出来；
9. 已知近似；
10. 明确的 anti-cheat review。

报告中必须明确回答：

> “如果删除所有 capability 语义标签，这些结果是否仍然成立？”

正确答案应当是：成立，因为结果由结构和物理产生。

---

# 12. Architecture

更新：

```text
docs/ARCHITECTURE_v0.2.md
```

增加“Capability is observed, not declared”原则。

明确区分：

- Structure = 世界真实结构；
- Actuation = 物理输入；
- Energy = 资源约束；
- Capability = 在具体环境/任务条件下观察到的可实现结果。

不要把 Capability 变成 Entity 固有 stat。

---

# 13. 工作方式

这是一个完整 Phase。

不要要求用户中途传话。

主代理负责：

- experiment design；
- implementation；
- measurements；
- regression；
- anti-cheat review；
- integration。

可使用 `gpt6-luna` 子代理处理边界清晰的测试/调查。

不要建立专门 verifier 子代理。

不要开始 Phase 13。

---

# 14. 完成流程

完成后：

1. 更新 Architecture；
2. 创建 `PHASE12_REPORT.md`；
3. 完成所有实验和量化；
4. 做 anti-cheat scan；
5. 跑完整测试；
6. commit；
7. push Phase 分支；
8. 创建 PR 到 `main`；
9. 停止等待评审。

---

# Phase 12 核心验收

**同样的基础规则下，仅改变结构、材料或安装方式，就能够改变 Entity 实际可实现的物理结果；Construction 能创造这种结果，Damage 能让它消失，Repair 能让它恢复。**

如果需要任何 `canX`、能力数值或结果特判才能让实验成立，则 Phase 12 不通过。
