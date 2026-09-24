# NEXT TASK — v0.3 Phase 14：通用外部接触损伤（Universal Contact Material Damage）

v0.2 已完成并接受。

v0.3 开始后，不再以“证明结构能产生能力”为主，而是开始补齐这些结构与外部世界真实交互时缺失的通用物理后果。

当前最重要的缺口：

> Morphodyne 已能让 Connection 因真实载荷损坏，但一个独立 Part 本身受到外部撞击、挤压、工具接触时，还缺少一条完整、通用、可持续的材料损伤路径。

这会直接限制未来：

- 牙齿咬压；
- 爪击；
- 锤击；
- 机械夹压；
- 坠落物撞击；
- 工具破坏；
- 外壳破裂；
- 生物组织受伤。

Phase 14 只解决这个底层问题。

不要开始动物、攻击、捕食、AI 战斗系统。

---

## 1. 核心目标

建立统一因果链：

```text
Physical Contact / External Load
        ↓
PhysicsAdapter measured contact load
        ↓
Part Material Response
        ↓
Damage / Fracture
        ↓
incident Connection separation
        ↓
World structural / functional consequence
```

任何 Entity 都使用同一规则。

禁止：

```text
attacker → damage target
weapon → damage
bite → damage
claw → damage
```

世界只知道：

- 哪个 Part 受到了什么物理载荷；
- Part 使用什么 Material；
- Material 是否承受得住。

---

# 2. 当前问题必须先确认

开始实现前，先审查现有：

- `StructuralDamageRuntime`
- `applyConnectionLoad`
- Part DamageState
- `readPartImpactImpulse`
- `readPartContacts`
- Rapier contact-force event
- Part fracture 后 incident Connection 的处理

明确说明：

1. 当前外部 contact load 如何进入系统；
2. 为什么一个无 Connection 的单 Part Entity 目前不能完整表达自身材料破坏；
3. 当前 impact → connection distribution 是否会与新的 Part Damage 重复计算；
4. 如何在不双重扣 Damage 的情况下扩展。

不要先写代码再补解释。

---

# 3. Part Damage 必须是一等公民

现有 Part 已有 DamageState，不要建立第二套：

```text
SurfaceDamage
ContactDamage
CombatDamage
```

之类平行状态。

应该扩展现有 Core Damage，使 Part 可以因为**直接施加在自己身上的外部物理载荷**发生：

- intact
- degraded
- fractured

Part fracture 后，现有结构规则继续负责：

- incident Connections 失效 / 分离；
- structural components 重新计算；
- downstream capability 自然变化。

不要创建：

```text
destroyed = true
disabled = true
injured = true
```

作为额外能力结果。

---

# 4. 第一版载荷范围

Phase 14 第一版只处理：

1. **Contact / impact impulse**
2. **持续 contact force**

可以复用现有单位：

- impulse: N·s
- force: N
- duration: s

不要求本 Phase 做：

- 切割；
- 穿刺；
- 接触面积精确求解；
- 压强；
- 应力张量；
- crack propagation；
- FEA；
- soft body；
- temperature；
- abrasion；
- corrosion。

这些以后再做。

本 Phase 目标只是：

> 一个 Part 本身受到足够大的外部物理接触载荷时，可以依据 Material 发生真实 Damage / Fracture。

---

# 5. Material 规则

优先复用现有 Material 参数：

- `yieldImpulseNs`
- `toughnessImpulseNs`
- `yieldForceN`
- `ultimateForceN`

如果当前含义不足，可小幅澄清，但不要为了 Part Contact 再复制：

```text
contactYieldForce
contactToughness
weaponResistance
armor
```

第一版允许同一组材料阈值同时参与：

- Connection 端点材料承载；
- Part 外部接触承载。

如确实发现物理语义冲突，必须先在架构文档说明，再设计最小的通用材料扩展。

---

# 6. Impact 与 sustained force

需要明确区分：

### 瞬时碰撞

高 impulse：

```text
contact impulse
→ Part damage
```

### 持续挤压

例如一个 actuator 驱动的结构把目标压在墙上。

即使没有一次巨大的碰撞，也必须可以：

```text
sustained contact force
→ overload accumulation
→ Part fracture
```

禁止：

```text
if contactTicks > X => damage
```

时间只能通过：

```text
measured force × duration / overload integral
```

之类通用物理量进入。

---

# 7. Contact 数据源

优先扩展 PhysicsAdapter 的现有 contact observation。

当前 `PhysicalContact` 至少有：

- point
- impulseNs

如果 Phase 14 需要持续 force，可以考虑让 PhysicsAdapter 暴露：

- forceN
- 或 equivalent average force

但必须来自 Rapier 的真实 contact force / impulse 数据。

不要在 Core 中访问 Rapier。

不要从：

- fixture 名称；
- payload mass；
- actuator command；

直接推导 Damage。

---

# 8. 双重计算防护

这是 Phase 14 最关键的架构问题。

当前外部 Part impact 会被 StructuralDamageRuntime 分配给 incident Connections。

新增 Part direct damage 后，不能出现：

```text
同一个 contact impulse
→ Part damage
→ 又作为相同含义重复造成 Connection damage
→ 实际损伤翻倍
```

必须明确设计：

- 外部载荷作用于 Part；
- internal structural load 作用于 Connection；
- Part fracture 可以导致 Connection separation；
- 但同一份能量/载荷不要无理由重复计算。

可以保留低精度近似，但必须在报告中解释载荷流。

---

# 9. 必须完成的实验

所有核心实验使用真实 Rapier + WorldRuntime。

## Experiment A — Single Part Can Break

构造一个没有任何 Connection 的单 Part passive Entity。

对它施加两种真实撞击：

- 低 impulse；
- 高 impulse。

要求：

- 低 impulse 不 fracture；
- 高 impulse fracture；
- 不需要 Connection；
- 不需要 attacker type；
- 不需要语义 damage call。

这是 Phase 14 最核心验收。

---

## Experiment B — Material Changes Outcome

两个几何、mass、撞击条件完全相同的 Part。

只改变 Material 容量。

要求：

- 弱材料发生更高 Damage / fracture；
- 强材料保持完整或损伤更低；
- 冲击完全相同。

禁止：

```text
if materialId === ...
```

必须来自数值 Material 参数。

---

## Experiment C — Sustained Compression

构造：

- passive target Part；
- actuator-driven non-Agent press / jaw / slider；
- static support。

让 actuator 持续把目标压向支撑。

要求：

- 低输出 / 低持续载荷时 target 保持；
- 高输出或长期真实过载时 target 发生 Damage / fracture；
- 不需要一次高 impulse；
- Damage 来自真实 contact force；
- actuator 不直接调用 target Damage。

因果链必须是：

```text
Actuator
→ Physics
→ Contact Force
→ Target Part Damage
```

---

## Experiment D — Different Causes, Same Rule

用同一个 target Blueprint / Material。

至少两种不同来源：

1. passive falling / launched object；
2. actuated machine contact。

要求：

- 两种来源都通过同一个 Part load path；
- Core 不知道“谁是攻击者”；
- 相似量级的 physical load 产生可解释的相似 Damage response。

---

## Experiment E — Part Fracture Causes Structural Loss

构造一个多 Part 结构，其中关键 Part 有 incident Connections。

通过真实外部 contact 让这个 Part fracture。

要求：

```text
external contact
→ Part fracture
→ incident Connections separate
→ component ownership changes
→ measured physical function changes
```

功能变化只作为观察结果。

禁止：

```text
if fractured => actuatorDisabled
```

如果 actuator 因结构断开不再有效，应由现有 ownership / connection / physics 路径自然产生。

---

# 10. 不要求做几何“锋利度”

Phase 14 不要急着实现：

- tooth sharpness；
- blade sharpness；
- claw penetration；
- contact area；
- pressure concentration。

第一版只需要证明“外部接触可以破坏 Part”。

**锋利形状如何集中应力**留给后续 Phase。

因此不要添加：

```text
sharpness
biteMultiplier
cutDamage
pierceDamage
```

---

# 11. Part fracture 后的物理存在

需要明确 Part fracture 在第一版意味着什么。

允许采用当前低精度规则：

- DamageState = fractured；
- incident Connections 分离；
- Part rigid body 仍然存在于世界中。

不要为了 Phase 14 做：

- mesh 碎裂；
- voxel fracture；
- 生成碎片；
- 几何断裂。

这些不是当前核心目标。

报告中明确说明：

> fractured 是材料/结构失效状态，不代表视觉网格自动碎成多个小块。

---

# 12. World / Construction / Sandbox

Phase 14 以 Runtime + tests 为主。

God Sandbox 只做必要更新：

- Part inspection 能看到自身 damage；
- 如果低成本，可看到最近 contact impulse / force；
- fracture 状态有可见提示。

不做新 UI 大改。

不要加入“攻击按钮”。

现有“施加冲击”仍然只是一个物理测试工具。

---

# 13. Anti-cheat

完成前扫描生产代码。

禁止：

- `weapon`
- `attacker`
- `victim`
- `biteDamage`
- `clawDamage`
- `attackPower`
- `armorRating`
- `isTarget`
- `isBreakable`
- `if mass > ... => fracture`
- fixture ID / experiment ID 参与 Damage 逻辑。

测试文件可以使用描述性名称，但生产 Core / Physics / Simulation 不能靠这些概念决定结果。

---

# 14. Architecture Boundary

保持：

```text
Core
  Material / Damage semantics

PhysicsAdapter
  physical contact observation

Simulation
  routing measured physics into Core damage

Tools
  inspection / experiment UI
```

Core 不依赖 Rapier。

Physics 不决定材料是否 fracture。

UI 不决定 Damage。

Agent 不参与。

---

# 15. Regression

必须保证：

- Phase 9 Structural Load；
- Phase 10 Tension；
- Phase 11 Energy；
- Phase 12 capability experiments；
- Phase 13 Sandbox；

继续工作。

特别检查新增 Part contact damage 后是否让旧场景因为普通接触突然大量 fracture。

默认 v0.1/v0.2 Blueprint 如果未声明对应 Material 阈值，应保持合理兼容，不应全部变脆。

---

# 16. 测试

至少新增：

- Core direct Part load tests；
- single-Part impact integration；
- material comparison；
- sustained compression；
- two-source generality；
- fracture → connection separation / component split；
- existing impact regression。

完成前运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:boundaries
```

---

# 17. 报告

创建：

```text
PHASE14_REPORT.md
```

必须记录：

1. v0.2 为什么不足以表达单 Part 外部破坏；
2. external Part load 与 internal Connection load 如何区分；
3. 防止双重计算的设计；
4. Part Damage 的单位和公式；
5. 五个实验的定量结果；
6. Material 对结果的影响；
7. sustained contact force 的数据来源；
8. fracture 后 World 如何处理结构；
9. anti-cheat audit；
10. 已知低精度边界。

---

# 18. v0.3 原则

Phase 14 是 v0.3 第一步。

v0.3 的方向是逐步让 Morphodyne 的实体能够发生：

```text
真实接触
→ 材料受力
→ 损伤
→ 结构失能
→ 行为后果
```

以后才能合理进入：

- 牙齿；
- 爪；
- 工具；
- 动物身体；
- 捕食与对抗。

但本 Phase 不实现上述具体内容。

---

# 19. 工作方式

这是一个完整 Phase。

不要要求用户中途传话。

主代理负责：

- architecture review；
- load-flow design；
- implementation；
- integration experiments；
- anti-cheat review；
- regression。

可使用 `gpt6-luna` 子代理完成边界清晰的调查或测试工作。

不要建立专门 verifier 子代理。

不要开始 Phase 15。

完成后：

1. 更新 `docs/ARCHITECTURE_v0.3.md`（如果不存在则创建）；
2. 创建 `PHASE14_REPORT.md`；
3. 完整测试；
4. commit；
5. push；
6. 创建 PR 到 `main`；
7. 停止等待评审。

---

# Phase 14 核心验收

**一个没有任何 Connection、没有任何语义标签的单独 Part，必须能够仅因为真实外部物理接触超过其 Material 承载能力而发生 Damage / Fracture。**

如果仍然必须依赖 Connection、攻击者类型、武器字段或脚本 Damage 才能破坏目标，则 Phase 14 不通过。
