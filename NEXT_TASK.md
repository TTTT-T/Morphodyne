# NEXT TASK — Animal Arena v0.5：Contact Concentration + Physical Bite

Animal Arena v0.4 已经通过并合并到 `main`。

当前已经成立：

- Leopard 是真实多 Part 四足身体；
- shoulder / hip / spine 使用通用 spherical Connection；
- angular limits 与 passive compliance 已分离；
- Agent 通过 Sensor → Brain → Motor → Actuator → Physics 自主行动；
- 四足 locomotion 已有明确 stance / swing / seek；
- 正常摩擦下 traction 收口门槛通过；
- 双豹能自主接近并发生前肢、头、下颌真实接触；
- 没有 HP、attackPower、biteDamage、torso 直接推进、锁脚或读取对手精确坐标。

下一阶段不再继续磨 gait。

本阶段验证 Morphodyne 最核心的一件事：

> “牙齿更会造成伤害”必须来自真实几何、材料、接触面积/应力集中和下颌执行器，而不是任何 attack stat 或 biteDamage。

最终目标：

> 同一套通用 Contact / Material / Damage 规则下，窄尖结构与宽钝结构在相近载荷条件下产生不同局部材料结果；Leopard 的真实下颌和物理牙齿可以通过自主闭合产生真实接触、夹持和局部损伤。

---

## 1. 先建立通用 Contact Concentration

当前 Phase 14 Damage 主要使用：

- contact impulse；
- step-average force；
- Material force / impulse thresholds。

它还不能表达：

> 同样 500 N，宽平面压上去和一个小尖端压上去不应该完全一样。

新增通用、backend-neutral 的接触集中度表示。

建议形式：

```
ContactPatch
- point
- normal
- force
- impulse
- effectiveArea
- pressure / concentration
```

具体字段名可以调整，但必须满足：

- 不含 tooth / claw / weapon / leopard 语义；
- 对任何 Part geometry 都适用；
- PhysicsAdapter 负责从物理接触与几何信息产生测量；
- Core Damage 只消费通用物理量；
- Rendering / Agent 不能决定 Damage。

---

## 2. effective contact area 必须是物理近似，不是攻击倍率

Rapier 0.20 不直接提供真实 Hertz contact patch。

允许第一版做近似，但必须：

- 明确公式；
- 明确单位；
- 明确局限；
- 对 box / sphere / capsule / convex 有一致规则；
- 对相同几何和姿态可重复；
- 不允许根据 Part ID、Entity 类型或“牙齿”标签决定面积。

可以基于：

- 接触法向；
- collider 局部几何尺寸；
- 接触特征尺度；
- 合理上下限；

估计 `effectiveAreaM2`。

不要直接写：

```
if smallPart:
  damage *= 10
```

---

## 3. Material 增加可选的局部压强能力

如果实现 ContactPatch，则 Material 可以新增可选通用属性，例如：

```
yieldPressurePa
ultimatePressurePa
```

或等价 backend-neutral 表达。

要求：

- 旧 Material 不配置时保持向后兼容；
- 原有 force / torque / impulse Damage 继续工作；
- pressure path 是附加物理失效条件，不替代所有旧规则；
- 不允许新增 enamelDamage / skinHP / biteResistance 之类物种字段。

---

## 4. Damage 的因果链

应该是：

```
jaw actuator
→ jaw rotates
→ tooth geometry contacts target
→ Rapier contact
→ force / impulse + effective contact area
→ local pressure
→ Material response
→ deformation / fracture
→ Connection / body function changes
```

绝不能是：

```
Brain selects bite
→ apply bite damage
```

Brain 只负责“尝试闭合下颌”。

Physics 决定：

- 有没有碰到；
- 碰到哪里；
- 力多大；
- 接触多集中；
- 有没有损伤。

---

## 5. Leopard 增加真实物理牙齿

当前视觉牙齿不能继续作为最终攻击结构。

给 Leopard 增加少量真实物理牙齿即可，不追求完整牙列。

建议第一版：

- 上颌左右各 1～2 个；
- 下颌左右各 1～2 个。

每颗牙必须是普通 Part：

- geometry：小 capsule / convex / 其他已有通用几何；
- material：普通 Material；
- 通过普通 rigid Connection 连接到 head 或 jaw；
- 有真实 mass；
- 有真实 collider；
- 可以断裂/分离。

禁止：

- ToothPart Core 类型；
- isTooth；
- biteDamage；
- damage multiplier。

“这些 Part 是牙齿”只能存在于 Blueprint 命名和 Visual 中。

---

## 6. 上下颌必须形成真实夹持

Leopard 继续使用：

- head；
- jaw；
- jaw joint；
- jaw actuator。

当 Brain 进入现有 interact：

- 下颌执行器闭合；
- 上下牙随真实 Part 运动；
- 如果目标结构进入口部，物理接触可能形成双侧夹持；
- friction / geometry / actuator torque 决定是否能保持。

禁止：

- grapple weld；
- attach opponent；
- freeze target；
- “咬中后锁定”。

如果目标从嘴里滑出去，就是物理结果。

---

## 7. 先做受控实验，不先调双豹战斗

必须先建立完全可重复的 Contact Concentration 实验。

### A — 宽 vs 窄接触

保持尽可能相同：

- source mass；
- source velocity / actuator load；
- target Material；
- target geometry；
- contact direction。

只改变 source 接触几何：

- broad flat；
- narrow tip。

要求记录：

- peak force；
- impulse；
- effectiveArea；
- pressure；
- target deformation；
- fracture result。

预期：

> narrow tip 的局部 pressure 明显更高。

不要求每次都必须 fracture，但必须证明几何真的改变局部物理量。

### B — Material 对照

相同 narrow tip 和运动：

只改变 target Material 的 pressure capacity。

要求：

- 较弱材料先屈服/断裂；
- 较强材料保持更完整。

### C — 纯机械 Jaw fixture

建立一个没有 Brain 的通用夹具：

```
upper structure
jaw
jaw actuator
small contact tips
target
```

用普通 ControlSignal 闭合。

要求：

- 真实夹持；
- 有双侧 contact；
- pressure 来自几何；
- Damage 来自 Material；
- 不依赖 Leopard/Agent。

这个实验非常重要，用来证明新规则不是为豹子写的。

---

## 8. Leopard 物理 Bite 实验

单 Leopard + 被动目标。

目标放在真实口部可达区域。

Brain 仍然通过匿名 Sensor / interact 决策，或测试中允许直接给 Leopard 的 jaw Actuator 一个普通 ControlSignal 做“身体能力实验”。

要求区分两类实验：

### 身体能力测试

允许固定普通 ControlSignal，仅验证：

- jaw 能闭合；
- teeth 能接触；
- 能形成集中压力；
- 能造成局部 Damage。

### Agent 行为测试

必须走：

```
Sensor
→ Brain
→ interact
→ Motor
→ jaw actuator
```

不能人为触发 damage。

---

## 9. Blunt Jaw 对照

为了证明“牙齿能力来自结构”，必须有一个对照。

在相同：

- jaw torque；
- target；
- spawn；
- Material；
- simulation window；

条件下比较：

### toothed geometry

真实小接触尖端。

### blunt geometry

没有突出牙齿，或使用宽接触块。

要求：

- toothed 的 effectiveArea 更小；
- pressure 更高；
- Damage / deformation 更明显。

不能通过修改：

- maxOutput；
- Energy；
- target threshold；

来制造结果。

---

## 10. 双豹 Arena

受控实验通过后，再把真实 teeth 接回默认双豹 Arena。

不要增加复杂战斗状态机。

Brain 仍然保持现有：

- recover；
- search；
- approach；
- interact。

近距离 interact 时现有 jaw / forelimb 使用身体。

需要观察：

- jaw actuator 是否实际闭合；
- tooth 是否碰到对方；
- 是否产生非零 pressure；
- 是否产生真实 Material Damage；
- 结构断裂后是否自然改变身体和感知。

不要求每一局都必须“咬死”。

随机/姿态不同导致：

- 没咬到；
- 咬到但滑脱；
- 产生小变形；
- fracture；

都允许。

---

## 11. Claw 暂时不做

本阶段只解决：

**contact concentration + physical bite。**

Paw / claw：

- paw 继续是真实物理 Part；
- claw 可以继续是视觉；
- 不新增 claw damage。

等 bite 这条普适规则验证后，claw 应该能自然复用同一 Contact Concentration，而不是再写一套系统。

---

## 12. Fracture 后仍遵守真实结构

如果牙齿：

- 自己 fracture；
- rigid Connection 断裂；

它必须真实脱落。

如果对手：

- 某 Part fracture；
- 某 Connection separation；

Agent 只能面对新的身体状态。

Arena 不补偿。

牙齿本身也不能是无敌 collider。

---

## 13. 必须避免的“假 Contact Concentration”

以下实现均不通过：

```
if partId.includes("tooth")
  pressure *= ...

if entity is Leopard
  damage *= ...

small collider => hardcoded attack bonus

interact skill => apply damage

jaw contact => target.damage(...)
```

Contact Concentration 必须从通用物理输入算出来。

---

## 14. Anti-cheat

重点扫描：

- attackPower；
- biteDamage；
- toothDamage；
- penetrationBonus；
- weaponTag；
- direct damage call from Brain/Motor/Arena；
- opponent target ID 注入；
- grapple weld；
- target freeze；
- teleport into mouth；
- contact result override；
- Leopard-specific branch in Core / Physics。

出现即失败。

---

## 15. 回归

不能破坏：

- v0.4 traction；
- spherical limits；
- passive compliance；
- Energy；
- existing external contact Damage；
- Construction；
- passive machine experiments；
- Sensor / Brain boundary。

v0.4 locomotion 不再追求继续优化，但至少保持：

- autonomous approach；
- real stance/swing；
- normal friction traction；
- 双豹真实接触。

---

## 16. 报告

创建：

```
ANIMAL_ARENA_V05_PHYSICAL_BITE_REPORT.md
```

必须回答：

1. ContactPatch / concentration 如何定义；
2. effective area 如何从通用 geometry 近似；
3. pressure 如何进入 Material Damage；
4. 与旧 force / impulse Damage 如何共存；
5. broad vs narrow 实验数据；
6. Material 对照数据；
7. 无 Brain 通用 jaw fixture 数据；
8. Leopard tooth Part / Connection 结构；
9. toothed vs blunt jaw 对照；
10. Agent 自主 bite 的真实事件链；
11. tooth 或目标 fracture 后发生了什么；
12. 是否发现任何 attack-stat / direct-damage shortcut；
13. 当前最大的真实物理限制是什么。

---

## 17. 工作方式

从最新 `main` 创建：

```
codex/animal-arena-v0.5
```

不要继续从旧 v0.4 分支开发。

这是一个完整大任务，不让用户中途传话。

主代理完成：

- ContactPatch / effective area；
- Material pressure response；
- generic mechanical experiments；
- physical teeth；
- jaw integration；
- Agent / Arena integration；
- anti-cheat；
- tests；
- report。

允许 `gpt6-luna` 子代理做：

- 接触面积近似方案审查；
- Material pressure model 审查；
- anti-cheat 独立检查。

不要建立 verifier 子代理。

完成后：

1. 全量测试；
2. `npm run typecheck`；
3. `npm run build`；
4. `npm run check:boundaries`；
5. browser smoke；
6. 创建报告；
7. commit；
8. push；
9. PR → main；
10. 停止等待独立审查。

# 最终验收

**同样的执行器、能量、材料和目标条件下，窄尖接触结构因为真实 effective contact area 更小而产生更高局部 pressure，并通过通用 Material/Damage 规则表现出比宽钝结构更强的局部破坏能力；Leopard 的“咬”只是 Brain 控制真实下颌和牙齿后的物理结果，不存在 biteDamage、攻击力或任何命中后直接伤害。**
