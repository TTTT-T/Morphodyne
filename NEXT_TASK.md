# NEXT TASK — v0.2 Phase 11：通用能量与功率（Energy & Power）

Phase 10 已通过并合并。

当前 Morphodyne 已经具备：

- Joint Actuator；
- Tension Actuator；
- attachment point 产生真实力臂；
- Rapier 物理运动；
- Phase 9 Structural Load；
- 真实受力导致 Damage / Separation。

下一步不增加新能力类型，也不进入动物、Brain、生态或 UI 美化。

Phase 11 只解决一个核心问题：

> **执行器不能再依赖一个不会减少的“availablePowerWatts”无限能源。**

本 Phase 建立最低限度、通用、可计算的 Energy / Power 资源层。

---

## 1. 核心目标

建立统一因果链：

```text
Finite Energy
    ↓
Power Budget
    ↓
ActuatorRuntime
    ↓
Joint / Tension physical output
    ↓
Rapier Physics
    ↓
Motion / Structural Load / Damage
```

Energy 只决定“执行器此刻最多能获得多少物理输出”。

Energy 不决定：

- 能不能走；
- 能不能咬；
- 能不能举起；
- 能不能攻击；
- 任何语义能力。

最终结果仍由结构 + Actuator + Physics 决定。

---

# 2. 第一版 Energy 模型

把当前仅有：

```text
availablePowerWatts
```

的无限能源模型扩展为一个**有限 Energy Store / Supply**。

具体命名由实现者决定，但至少应表达：

- capacity / initial energy：J；
- remaining energy：J；
- maximum usable power：W；
- efficiency：0..1；
- 当前 step 实际消耗；
- 累积消耗。

建议：

```text
EnergySourceSpec
EnergyState / EnergyRuntime
```

或同等清晰设计。

必须明确区分：

- **Energy (J)**：还能做多少功；
- **Power (W)**：每秒最多做多少功。

禁止继续把这两个概念混为一个数字。

---

# 3. 能量守恒规则

第一版只计算**机械正功**。

对于 actuator：

```text
mechanicalPower = positive physical output × relevant physical velocity
```

Joint Actuator：

- revolute：`torque × angular velocity`
- prismatic：`force × linear joint velocity`

Tension Actuator：

- `tension × contraction speed`

已经存在的 Phase 10 计算可以复用/整理。

每个 fixed step：

```text
mechanicalWorkJ = positiveMechanicalPowerW × seconds
energyDrawJ = mechanicalWorkJ / efficiency
```

要求：

- 剩余 Energy 不能变成负数；
- 没有足够 Energy 时必须减少本 step 的 actuator 输出；
- Energy = 0 时不能继续产生主动机械正功；
- maxPowerWatts 必须同时限制瞬时机械输出；
- 多个 actuator 共享同一个 supply 时不能分别各拿一份完整功率预算。

---

# 4. 关于静态力与负功

第一版采用**机械能模型**，不要假装已经模拟真实肌肉或电机损耗。

允许：

- actuator 在零速度时产生力但机械功为 0；
- actuator 被外界反向驱动时不自动消耗正机械功。

但必须明确记录这是第一版理想化边界。

禁止在 Phase 11 顺便实现：

- 肌肉维持张力的代谢消耗；
- 电机铜损；
- 制动器发热；
- regenerative braking；
- ATP；
- 电池化学；
- 燃料燃烧；
- 热系统。

**负机械功默认不回充 Energy。**

不要因为负功而凭空增加 remaining energy。

---

# 5. Efficiency

Efficiency 只做最低限度的一阶模型。

约束：

```text
0 < efficiency <= 1
```

它表示：

```text
stored energy → usable mechanical work
```

例如：

```text
10 J mechanical work
efficiency = 0.5
=> draw 20 J from store
```

损失的能量第一版可以直接视为未建模耗散。

不要创建 Heat Runtime。

---

# 6. 多执行器共享资源

这是 Phase 11 的关键验收之一。

如果同一个 Energy Supply 同时驱动多个 actuator：

```text
total requested mechanical power > maxPowerWatts
```

则必须通过一个通用分配规则限制总输出。

第一版可以使用 proportional scaling。

要求：

- 总机械输出不能超过 power ceiling；
- actuator 数量增加不会凭空增加总可用功率；
- 顺序不同不能明显改变总结果；
- Joint 与 Tension 必须共享同一个预算。

不要按 actuator 类型分别建立功率池。

---

# 7. Runtime ownership

Energy 必须有明确 Runtime state。

当前 `SpawnOptions.energy` 可以调整，但不要让调用方每 tick 自己手动扣 Energy。

World / Energy Runtime 应拥有：

- remaining energy；
- step budget；
- consumption accounting。

ActuatorRuntime 只提出/执行物理输出需求，不应自行伪造无限能源。

如果需要新增：

```text
EnergyRuntime
```

是合理的。

保持依赖方向清晰。

---

# 8. 是否进入 Blueprint

Phase 11 **不要求**现在就做电池 Part、燃料箱 Part 或能量网络。

因此不要为了“结构化能源”把范围扩大成电气系统。

第一版 Energy Supply 可以继续作为 WorldRuntime 的通用组成配置。

但是架构必须允许未来把 Energy Supply 绑定到具体 Part / device，而不需要推翻 Actuator API。

在文档中记录这个扩展边界即可。

---

# 9. 必须完成的实验

所有实验优先通过真实：

```text
WorldRuntime → Energy → ActuatorRuntime → Physics
```

路径。

## Experiment A — Finite Energy Exhaustion

同一个 actuated non-Agent machine：

- 固定控制输入；
- 固定结构；
- 固定 actuator；
- 给定有限 Energy。

要求：

- remaining energy 随实际正机械功下降；
- Energy 耗尽后，主动运动明显停止或不再继续增加机械能；
- 不允许通过 tick 数直接关闭 actuator；
- 必须由真实 Energy accounting 导致。

---

## Experiment B — Power Limit Changes Capability

两个完全相同的结构和 Energy 总量。

只改变：

```text
maxPowerWatts
```

要求：

- 高功率版本在同一时间窗口内能产生更高机械输出/运动响应；
- 低功率版本不是通过 speed multiplier 得到结果；
- 差异必须来自 actuator output 被统一 power budget 限制。

---

## Experiment C — Shared Power Budget

一个结构同时运行至少两个 actuator。

要求：

- 单独运行 actuator A 时可以获得较高输出；
- 单独运行 actuator B 时可以获得较高输出；
- 同时运行 A+B 时，总机械功率仍受同一个上限约束；
- 两个 actuator 不能各自获得完整 `maxPowerWatts`。

至少包含一次 Joint + Tension 共享 supply 的验证。

---

## Experiment D — Efficiency Changes Endurance

两个相同结构：

- 相同 stored Energy；
- 相同 maxPower；
- 相同控制；
- 只改变 efficiency。

要求：

- 低效率版本为相同机械功消耗更多 stored Energy；
- 更早耗尽；
- 不允许 efficiency 直接修改速度、力或 torque；
- 它只能通过 Energy consumption 改变长期能力。

---

## Experiment E — No Free Recharge

构造包含：

- 外界推动 actuator；
- negative mechanical work；
- 或结构被拉长 / 反向驱动

的情况。

要求：

- remaining energy 不增加；
- 不出现负 consumption；
- 不允许第一版系统自动再生能源。

---

# 10. 防作弊要求

禁止出现：

- `if energyLow => moveSlower`
- `if batteryEmpty => cannotWalk`
- `if actuatorCount > 1 => ...`
- `animalEnergy`
- `machineEnergy`
- `stamina`
- `mana`
- `fuelBonus`
- 任何具体内容语义。

Energy 只能通过：

```text
Energy → available mechanical output → Physics
```

改变结果。

禁止 Energy Runtime：

- 直接修改 Part pose；
- 直接修改 velocity；
- 直接制造 Damage；
- 直接修改 Agent goal；
- 直接设置 capability。

---

# 11. 与 Phase 9 / 10 的关系

必须保持：

```text
Energy
→ Actuator
→ Physics
→ Structural Load
→ Damage
```

不能变成：

```text
Energy
→ Damage
```

或者：

```text
Energy
→ Movement Result
```

Phase 10 Tension Actuator 的 attachment geometry / point-force 规则不能被改变成预计算 torque。

Phase 9 Structural Load 实验必须继续通过。

---

# 12. Compatibility

迁移当前所有主要 runtime / fixtures 到新的有限 Energy API。

不要留下一个生产默认路径继续悄悄使用“无限 Energy”。

如果为了测试需要无限 supply，只能：

- 明确命名为 test/debug helper；
- 不作为 WorldRuntime 默认值；
- 不进入正式 Blueprint / Sandbox 默认配置。

现有短时间 Agent / Machine 测试可以给予足够大的有限 Energy，避免无关行为变化。

---

# 13. 可观测性

Energy 必须可查询。

至少可以读取：

- remainingEnergyJ；
- consumedEnergyJ；
- 本 step 使用的 mechanical power；
- 当前 power limit。

God Sandbox 不要求重新设计 UI。

如果低成本，可以在现有 debug / inspection 中显示 Energy 状态；否则 API + tests 足够。

不要把 Phase 11 变成 UI Phase。

---

# 14. Tests

至少新增：

- Energy Core validation；
- Energy Runtime unit tests；
- finite energy integration；
- power sharing integration；
- efficiency integration；
- no-recharge regression；
- Joint + Tension shared budget。

并保持：

- Phase 9 experiments；
- Phase 10 experiments；
- existing Joint Actuator tests；
- Construction tests；
- WorldRuntime tests。

完成前运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:boundaries
```

---

# 15. 工作方式

这是一个完整 Phase。

不要要求用户在实现步骤之间传话。

主代理负责：

- architecture；
- implementation；
- integration；
- tests；
- self-review。

可以使用 `gpt6-luna` 子代理完成边界清晰的工作。

不要建立专门 verifier 子代理。

不要开始 Phase 12。

---

# 16. 输出

完成后：

1. 更新 `docs/ARCHITECTURE_v0.2.md`；
2. 创建 `PHASE11_REPORT.md`；
3. 记录 Energy / Power / Efficiency 的单位和公式；
4. 记录静态力与负功的第一版理想化边界；
5. 记录五个实验的定量结果；
6. 记录 Joint 与 Tension 如何共享功率；
7. 跑完整测试；
8. commit；
9. push Phase 分支；
10. 创建 PR 到 `main`；
11. 停止在评审边界。

---

# Phase 11 核心验收

**执行器能做多少事，必须同时受“还剩多少能量”和“此刻能输出多少功率”限制。**

如果 Energy 只是一个影响速度的数值 modifier，或者多个 actuator 能各自绕过共享预算，则 Phase 11 不通过。
