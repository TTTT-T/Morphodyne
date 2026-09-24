# NEXT TASK — v0.3 Phase 15：通用接触集中与压力代理（Geometry-Driven Contact Concentration）

Phase 14 已通过并合并。

Morphodyne 现在已经能做到：

- 一个完全独立、没有 Connection 的 Part，可以因为真实外部接触而发生 Damage / Fracture；
- 持续挤压可以通过真实 contact force 造成材料过载；
- Part fracture 会让 incident Connections 失效；
- 外部 Part contact 与内部 Connection reaction 已分流，避免同一次接触机械地重复扣两遍 Damage。

Phase 15 解决下一块基础问题：

> **同样大小的接触力，如果作用在宽面、窄边或很小的接触区域上，材料后果不应该完全一样。**

这是未来牙齿、爪、刀刃、尖头工具、机械压头能够从“几何形状”自然产生不同效果的必要底座。

本 Phase 仍然不实现牙齿、爪、武器、攻击系统，也不允许添加任何语义伤害倍率。

---

## 1. 核心目标

建立通用因果链：

```text
Geometry + Contact Manifold
        ↓
Measured Contact Force
        ↓
Effective Contact Concentration / Area Proxy
        ↓
Material Local Load
        ↓
Part Damage
```

必须保证：

```text
same total force
+ different physical contact geometry
→ different material response
```

而不是：

```text
sharp object
→ damage multiplier
```

---

# 2. 开始前先调查 Rapier 能提供什么

不要直接假定 Rapier JS 可以提供 contact area。

先检查当前 Rapier 0.20.0 的公开 API 和现有 adapter，确认是否能可靠获得：

- contact manifold；
- solver contact points；
- 每个接触点的位置；
- contact normal；
- per-contact force / impulse；
- contact point 数量；
- manifold 内接触点空间分布；
- collider shape 信息。

在 `PHASE15_REPORT.md` 中明确写：

1. Rapier 直接提供什么；
2. 不提供什么；
3. 最终采用什么低精度 proxy；
4. 为什么这个 proxy 仍然由实际几何与真实接触决定。

禁止伪造“精确压力”。

---

# 3. 第一版不是连续介质力学

Phase 15 不做：

- FEA；
- stress tensor；
- Hertz contact；
- crack mechanics；
- mesh deformation；
- soft body；
- penetration；
- cutting；
- slicing；
- puncture。

第一版只需要一个：

> **通用、稳定、可解释的接触集中程度代理。**

可以叫：

- `contactConcentration`
- `effectiveContactAreaM2`
- `contactStressProxyPa`

具体名称由实现决定。

如果无法可靠得到平方米意义上的 area，就不要假装单位是 Pa。

宁可使用明确命名的无量纲或近似指标，并文档化。

---

# 4. 禁止 semantic sharpness

生产 Core / Physics / Simulation 中禁止加入：

- `sharpness`
- `blade`
- `tooth`
- `fang`
- `claw`
- `weapon`
- `piercing`
- `cuttingPower`
- `penetration`
- `damageMultiplier`
- `pressureBonus`

也不要给 Blueprint 加：

```text
isSharp
sharpness = 0.8
```

未来所谓“锋利”，必须来自实际 geometry 导致的小接触区域 / 高集中载荷。

---

# 5. Contact observation

Phase 14 的：

```text
PartContactLoad
forceN
impulseNs
```

继续作为总接触载荷。

Phase 15 可以扩展一个新的只读物理观察，例如：

```text
ContactPatch
ContactManifoldSummary
PartContactConcentration
```

但它必须是 PhysicsAdapter 的 backend-neutral 数据。

可能包含：

- totalForceN；
- totalImpulseNs；
- contactPointCount；
- world contact points；
- characteristic span；
- effectiveAreaProxy；
- concentration proxy。

不要让 Core 读 Rapier manifold。

---

# 6. Proxy 设计原则

如果 Rapier 没有真实 contact area，第一版可以从：

- contact point 数量；
- contact points 的空间分布；
- collider geometry；
- local contact position；
- contact normal；

构建低精度 estimator。

要求：

### A. Geometry-sensitive

宽平面稳定接触与窄小接触必须得到不同 concentration。

### B. Load-sensitive

同一 geometry 下，更大的真实 contact force 必须提高 local load。

### C. Scale-aware

相同形状整体缩小时，不能完全得到与大型结构一样的局部接触尺度。

### D. Backend-owned measurement

几何接触估算在 PhysicsAdapter / physics measurement 层完成。

Core 只消费一个通用物理量，不知道 box / sphere / capsule / tooth。

### E. Stable enough

不要让 contact point 数量的一帧抖动导致 Damage 瞬间几十倍变化。

允许加入纯数值稳定处理：

- minimum patch scale；
- bounded smoothing；
- manifold aggregation；

但必须通用且不依赖 fixture。

---

# 7. Material response

不要创建一套新的 DamageState。

继续使用 Phase 14 的 Part Damage。

优先扩展 `PartLoad`，使 Core 能消费一个局部接触强度通道。

例如：

```text
forceN
impulseNs
contactConcentration
```

或：

```text
localForceDensityProxy
```

Material 如果需要新增一个通用容量参数，必须非常克制。

优先考虑：

- 复用现有 `yieldForceN` / `ultimateForceN`；
- 通过 concentration 对“局部有效载荷”进行通用转换。

只有确实无法表达时，才允许新增类似：

```text
yieldContactStress
ultimateContactStress
```

但必须：

- 物理意义清楚；
- 不与 weapon/armor 语义绑定；
- 有明确单位或明确声明是 proxy；
- 不破坏旧 Blueprint。

---

# 8. 向后兼容

旧 Blueprint 没有新 contact-local 参数时：

- 不应突然全部变得极脆；
- Phase 14 现有结果应基本保持；
- 可以默认 concentration factor = neutral；
- 或只有明确声明新 Material 参数时启用新局部响应。

不要偷偷重标所有已有 Material。

---

# 9. 必须完成的实验

所有核心实验使用真实 Rapier + WorldRuntime。

---

## Experiment A — Broad Face vs Narrow Contact

构造两个 source Part。

保持：

- mass；
- material；
- velocity / applied impulse；
- target；
- total collision setup；

尽可能相同。

只改变 source 的接触 geometry，使一个产生：

- 较宽接触；
- 较集中接触。

要求：

- 两者 target 收到的总 contact load 处于可比较范围；
- 集中接触的 concentration 明显更高；
- 在同一个 target Material 下，集中接触产生更高局部 Damage；
- 不能通过 source id / shape kind 分支直接赋 multiplier。

如果 broad/narrow 的总 force 差异过大，报告必须同时展示总载荷和 concentration，不能把 force 差异冒充几何效果。

---

## Experiment B — Same Force, Different Patch

这是最重要的 controlled comparison。

尽量构造 actuator-driven press：

- 同一个 actuator；
- 同样 maxOutput；
- 同样 Energy；
- 同样 target；
- 两种 press head geometry。

让两种情况达到近似相同的总 contact force。

要求：

```text
similar total force
different contact concentration
→ different target material response
```

如果无法做到完全相同，允许合理容差，但必须量化。

---

## Experiment C — Scale Matters

使用相同形状比例、相同材料。

比较：

- 大接触头；
- 缩小后的接触头。

要求：

- estimator 对物理尺度敏感；
- 不能只依赖 contact point count；
- 小尺度接触在相似总力下应产生更高集中程度。

---

## Experiment D — Passive vs Actuated Source

对同一个 target：

1. passive moving object；
2. actuator-driven press。

使用能产生相似 contact concentration + load 的配置。

要求：

- 两种来源走同一个 Material response；
- Core 不知道来源类型；
- 结果能通过物理量解释。

---

## Experiment E — Broad Support Must Not Become a Knife

构造普通支撑 / 平面承载场景。

要求：

- 大面积/低集中接触在正常载荷下保持稳定；
- 新系统不会让普通地面、平台、支撑结构因为“有 contact force”就持续快速 fracture；
- Phase 13 Sandbox 默认模板仍保持可用。

这是防回归验收。

---

# 10. 几何支持范围

第一版至少保证现有基础 primitive：

- box；
- sphere；
- capsule；

能够进入 estimator。

convex 如果 Rapier /现有 Geometry 数据不足：

- 可以采用保守 generic fallback；
- 但不能 fixture-specific。

报告中写清楚 convex 的近似。

---

# 11. 不做 penetration

即使一个小接触头把 target fracture：

Phase 15 也不要求它穿进目标。

允许结果仍然是：

```text
contact
→ local material fracture
→ Part DamageState fractured
```

刚体 collider 仍保持原几何。

不要为了视觉上“刺进去”：

- disable collision；
- teleport；
- shrink collider；
- spawn hole；
- delete target。

这些留到之后真正的 penetration / fragmentation 阶段讨论。

---

# 12. Phase 14 load-flow 不得被破坏

继续维持：

### 外部接触

```text
contact → Part material
```

### 内部结构载荷

```text
connection reaction → Connection structural state
```

### Part fracture

```text
Part fracture → incident Connection separation
```

Phase 15 不允许重新把同一 contact 复制成：

```text
Part local damage
+ Part force damage
+ Connection endpoint damage
```

三次重复计算。

必须在报告里画清楚 load flow。

---

# 13. 关于内部 Part stress 的已知边界

Phase 14 选择了：

- external contact 主要损伤 Part；
- internal Connection reaction 主要损伤 Connection。

Phase 15 不要顺便重做内部梁弯曲 / Part 内应力。

把它继续作为已知低精度边界记录：

> 一个 Part 目前不会因为没有外部接触的纯内部连续应力场自动产生真实截面破坏；结构内部失效主要由 Connection 表达。

未来如要解决，单独开 Phase，不要混入本阶段。

---

# 14. Sandbox 可观测性

只做轻量更新。

选中 Part 时，如果低成本，显示：

- contact force；
- contact impulse；
- contact point count；
- concentration / effective patch proxy。

不要新增攻击 UI。

现有物理冲击工具继续只是测试工具。

---

# 15. Anti-cheat

扫描生产代码，禁止：

- sharpness
- tooth
- fang
- claw
- blade
- weapon
- attack
- pierce
- cuttingPower
- damageMultiplier
- armor
- fixture id / experiment id 参与 concentration 或 Damage。

Shape kind 可以用于物理几何计算，但禁止：

```text
if sphere => damage *= 2
if box => damage *= 0.5
```

任何 shape-specific 逻辑必须是在计算实际几何尺度，而不是赋予伤害语义。

---

# 16. Regression

必须保持：

- Phase 9 Structural Load；
- Phase 10 Tension；
- Phase 11 Energy；
- Phase 12 Capability；
- Phase 13 Sandbox；
- Phase 14 direct contact Damage；

继续通过。

特别验证：

- 默认地面接触；
- Gripper；
- Tension template；
- Active body；

不会因为 concentration estimator 出现意外 fracture。

---

# 17. 测试

至少新增：

- PhysicsAdapter contact-manifold / concentration tests；
- broad vs narrow；
- same-force different patch；
- scale comparison；
- passive vs actuated source；
- broad support compatibility；
- Core Material response tests；
- Phase 14 regression。

完成前运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:boundaries
```

---

# 18. 报告

创建：

```text
PHASE15_REPORT.md
```

必须记录：

1. Rapier contact API 调研；
2. 为什么不能/能获得真实面积；
3. estimator 定义、单位与边界；
4. geometry 如何进入 estimator；
5. 是否使用 smoothing / minimum patch；
6. 五个实验的定量结果；
7. total force 与 concentration 分开展示；
8. backward compatibility；
9. Phase 14 load flow 是否保持；
10. anti-cheat audit。

---

# 19. 工作方式

这是一个完整 Phase。

不要要求用户中途传话。

主代理负责：

- Rapier API investigation；
- estimator design；
- architecture decision；
- implementation；
- integration experiments；
- anti-cheat review；
- regression。

可以使用 `gpt6-luna` 子代理做 API 调研或独立实验，但主代理负责最终方案。

不要建立专门 verifier 子代理。

不要开始 Phase 16。

完成后：

1. 更新 `docs/ARCHITECTURE_v0.3.md`；
2. 创建 `PHASE15_REPORT.md`；
3. 完整测试；
4. commit；
5. push；
6. 创建 PR 到 `main`；
7. 停止等待评审。

---

# Phase 15 核心验收

**在总接触力相近时，仅因为真实接触几何造成的接触集中程度不同，同一个 Material 就必须产生不同的局部损伤结果。**

如果最终效果依赖 `sharpness`、`weapon`、`tooth`、shape damage multiplier 或 fixture 特判，则 Phase 15 不通过。
