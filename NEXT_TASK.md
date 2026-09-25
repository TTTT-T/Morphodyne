# NEXT TASK — Animal Arena v0.2：Leopard Agent + Autonomous Duel

这次正式纠正方向。

Morphodyne 的目标不是“玩家驾驶机器人互殴”，而是：

> 动物和机械都由同一套结构、材料、关节、执行器、感知、Brain 与物理规则组成；实体没有预定义攻击力，能力来自身体结构和控制。

Arena v0.1 已经证明“双 Entity + 真实碰撞 + Damage”闭环可行。

下一步不再继续 Rammer / Gripper 产品化，而是先做第一只真正的动物 Agent：**豹子**。

最终目标：

> 两只独立 Leopard Agent 进入 Arena 后，不需要玩家控制；它们通过自己的传感器形成感知，通过各自 Brain 做决定，通过自己的身体和 Actuator 移动、转向、扑近、抓抱/压制、闭合下颌，并由真实接触和结构损伤决定战斗结果。

本阶段是一个完整大任务，不再拆成十几个小 Phase。

---

## 0. 实现基础

开发请从当前最新 Arena 分支继续：

```
codex/arena-v0.1
```

当前该分支已经有：

- 双 Entity Arena 基础；
- ArenaObserver；
- 双实体真实接触 Damage；
- PartVisual / visual assembly 基础；
- 中文 Arena UI。

其中通用基础可以保留。

Rammer / Gripper：

- 可以保留为测试 fixture；
- 不再作为默认 Arena 内容；
- 不再继续美化或扩玩法。

默认 Arena 最终改为：

```
Leopard A
vs
Leopard B
```

---

# 1. 第一目标：真正建立 Leopard Body

这里的“豹子模型”不是给机器人套豹子皮。

必须先建立一个真正 animal-like 的物理身体 Blueprint。

推荐第一版身体规模约 18～24 个真实 Part，不要求解剖级精度，但必须具备：

- 前躯 / 胸腔；
- 后躯 / 骨盆；
- 可活动脊柱连接；
- 颈部；
- 头部；
- 独立下颌；
- 四条腿；
- 每条腿至少：
  - proximal segment；
  - distal segment；
  - paw / terminal contact；
- 2～3 节尾巴。

身体外形应大致符合豹子：

- 低伏；
- 躯干修长；
- 四肢位于躯干下方；
- 肩胛/髋部位置合理；
- 头颈向前；
- 长尾用于真实惯性和平衡。

禁止：

- 轮子；
- 隐藏反应轮；
- 悬浮；
- 机器人底盘；
- 用一个大 box 当整只动物。

---

# 2. Leopard 仍然只能由通用结构组成

不要新增：

```
AnimalPart
LegPart
PawPart
ToothPart
LeopardJoint
BiteJoint
AttackPart
```

Core 中仍然只有通用：

```
Part
Material
Connection
Actuator
Sensor
Damage
Energy
```

“这是腿”“这是下颌”“这是尾巴”只属于：

- Blueprint 组织；
- controller mapping；
- rendering；
- debug 名称。

不能变成 Core 能力标签。

---

# 3. 多自由度关节问题必须正面处理

当前旧 active body 几乎全部是单轴 revolute，这对于真正四足动物过于受限。

先调查当前 Rapier 0.20 能否通过公开 API 稳定支持：

- spherical joint；
- generic multi-axis joint；
- 或合理的多 revolute 组合。

如果 Leopard 的肩/髋需要多自由度：

优先新增**通用 Connection 能力**，例如：

```
spherical
universal
```

前提是：

- backend-neutral；
- 不是 leopard-specific；
- 其他机械结构以后也能使用；
- 有明确测试。

如果 Rapier JS 当前接口不适合，则允许用通用的双 revolute / 中间 joint carrier 组合实现第一版。

不要为了豹子创建特殊物理捷径。

---

# 4. 身体必须真的靠自己的关节与肌肉样执行器站立

豹子不能通过：

- torso upright torque；
- applyHover；
- body-level stabilization impulse；
- setRotation；
- hidden support force；

保持站立。

允许的是：

```
proprioception
→ posture controller
→ joint/tension actuator signals
→ physical joints
→ ground reaction
→ body posture
```

也就是说：

> “肌肉发力维持姿态”可以，
> “世界偷偷把身体扶正”不可以。

如果现有 Joint Actuator 很难得到稳定四足姿态，允许实现最小的**通用** passive compliance / damping / rest-angle support。

但必须是：

- Connection / actuator 层面的通用物理机制；
- 对所有结构都可用；
- 不是对 leopard chassis 直接施力。

---

# 5. 动物视觉模型

使用已经完成的 PartVisual / visual assembly 思路。

目标是让它看起来像一只**风格化但明确可识别的豹子**，而不是机械兽。

至少有：

- 有机躯干轮廓；
- 头部和口鼻；
- 耳朵；
- 独立下颌；
- 四条清晰的腿；
- 足部；
- 长尾；
- 黄褐/金黄色主体；
- 简单黑色斑点或豹纹视觉提示。

可以是低多边形 / stylized 3D，不要求毛发和高精贴图。

关键要求：

- visual assembly 必须绑定真实 Part；
- 腿断了，视觉腿一起断；
- jaw 脱离，视觉下颌随它一起；
- 不能用一整张不可分离的静态 Leopard mesh 覆盖物理身体。

视觉外形不要明显超出真实 collider 范围，尤其：

- 头；
- jaw；
- paw；
- 身体侧面。

---

# 6. Leopard 的真实感知

每只豹子必须拥有自己的 SensorRuntime。

第一版至少：

### proprioception

感知自己的：

- orientation；
- angular velocity；
- local velocity；
- limb relative pose；
- joint state。

### forward / head range sensing

用于发现前方物体。

可以继续使用匿名 RangeSensor。

Brain 不允许读取：

```
world.readPartPose(otherEntity)
opponent.position
opponent.entityId
```

来作弊追踪。

它只能知道：

> “我的前方/侧方某个方向，在某距离有物体”。

### contact sensing

至少在：

- paws；
- head / jaw；

提供接触反馈。

---

# 7. “有自己的想法”必须真正使用 Brain

当前 ArenaOpponent 这种：

```
read opponent exact pose
→ steer toward target
```

只适合 v0.1 测试。

Leopard Arena 中禁止继续使用它作为主要 AI。

两只豹子都必须拥有独立的：

```
SensorRuntime
→ AgentPerceptionView
→ SelfModel / WorldModel
→ BrainRuntime
→ Decision
→ Skill / Motor controller
→ ControlSignal
→ Actuator
```

也就是说：

> Arena 不告诉它“敌人在这里，你现在攻击”。

Brain 自己根据当前感知做短时决策。

---

# 8. 第一版 Brain 不需要聪明，但必须是真的决策

不要做复杂神经网络。

先使用当前可替换的 RuleDecisionPolicy 架构，扩展一个简单的 autonomous engagement policy。

Brain 至少需要在以下行为之间动态选择：

### 保持/恢复姿态

当：

- 身体不稳定；
- 翻倒；
- proprioception 明显异常；

优先尝试恢复稳定。

### 寻找 / 接近

当前方没有近距离接触目标时：

- 探索；
- 根据 range return 转向；
- 接近前方可感知目标。

### 近距离交互

当头部附近检测到物体时：

- 压低/调整头部；
- 尝试闭合下颌；
- 调整前肢姿态。

### 身体接触后的反应

根据：

- contact；
- 自身稳定性；
- 当前姿态；

可以：

- 继续推进；
- 转向；
- 重新站稳；
- 重新调整 jaw / forelimb。

这已经足够称为第一版“有自己的想法”。

它不需要懂：

- 对方名字；
- 对方血量；
- 哪个动作一定成功。

---

# 9. 禁止脚本战斗

严禁：

```
0-2s: run
2-3s: bite
3-4s: paw
```

也禁止：

```
if opponentDistance < 1:
    biteSucceeded = true
```

每个动作必须是：

```
current perception
+ current self model
+ internal drive / policy
→ current intention
```

然后由物理决定有没有做到。

两局战斗因为接触姿态不同，允许出现不同结果。

---

# 10. 身体 Skill / Motor Synergy

Brain 不应该直接控制二十个关节。

建立一个 body-owned motor layer，把高层意图转换成多个 Actuator ControlSignal。

第一版至少需要：

- maintain/recover posture；
- locomote forward；
- turn；
- head orient / lower；
- jaw close/open；
- forelimb reach / brace。

这些是 Motor Skill / Synergy，不是“能力值”。

例如：

```
jaw-close intent
→ jaw actuator signal
→ jaw physically rotates
→ maybe contacts opponent
→ maybe produces load
→ maybe produces Damage
```

而不是：

```
bite()
→ damage
```

同理：

```
forelimb reach
```

只控制肩/肘等 actuator，绝不能直接把对方抓住。

---

# 11. 两只 Leopard 必须是两个真正独立的 Agent

Arena 默认生成：

```
leopard-a
leopard-b
```

可以使用同一个 LeopardBlueprint。

但它们必须分别拥有：

- 独立 Sensor state；
- 独立 BrainRuntime；
- 独立 SkillRuntime / body controller state；
- 独立 Energy；
- 独立 Damage；
- 独立 decision history。

禁止使用一个中央 ArenaAI 同时操纵双方。

Arena 只负责：

- spawn；
- reset；
- time；
- rendering；
- observer；
- round-end。

---

# 12. 自主战斗

进入 Arena 后：

**不需要玩家按 WASD。**

正常流程应当是：

```
两只豹子出生
↓
分别感知世界
↓
分别做决定
↓
尝试接近
↓
姿态与轨迹自然变化
↓
发生头/身体/腿接触
↓
jaw / limbs 根据各自决策继续运动
↓
真实接触产生载荷
↓
Material / Connection Damage
↓
身体功能自然下降
↓
Brain 根据新的感知继续决定
```

这是本阶段真正想验证的东西。

---

# 13. “攻击”仍然不能成为物理属性

严禁新增：

- attackPower；
- biteDamage；
- clawDamage；
- pawDamage；
- leopardDamage；
- criticalHit；
- armor；
- HP；
- combatStrength。

第一版甚至不要求真正做“牙齿锋利度”。

下颌只需要真实闭合并产生接触力。

如果后续发现：

> jaw 和宽平面接触因为缺少接触面积模型而几乎无区别

那才正式恢复 Contact Concentration / Phase 15。

让 Arena 告诉我们什么时候需要它。

---

# 14. 爪和牙第一版怎么处理

第一版不要提前做复杂切割/穿刺。

### Jaw

必须有：

- skull Part；
- jaw Part；
- jaw joint；
- jaw actuator。

jaw 真实闭合、碰撞、夹持。

### Teeth

可以先有低精度视觉牙齿。

如果将牙齿做成真实物理 Part：

- 必须是通用 geometry；
- 不得附带 damage multiplier。

但本阶段不要求。

### Paw / Claw

paw 必须是物理 Part。

claw 第一版可以只做视觉，不要求穿刺。

先验证身体和自主 Agent。

---

# 15. Damage 后 Brain 仍然面对真实身体

例如：

- 一条前腿 Connection 断裂；
- jaw actuator 因结构断开失效；
- head sensor 掉落；
- 身体翻倒；

不能由 Arena 自动修正。

Brain 只能从自己的感知发现：

- feedback 消失；
- 稳定性变差；
- 目标没按预期移动；

然后改变决定或失败。

这正是 Morphodyne 的核心。

---

# 16. Arena UI

玩家角色从“操纵者”改成“观察者”。

默认不提供 WASD。

UI 重点显示：

- Leopard A 当前 Goal / Skill；
- Leopard B 当前 Goal / Skill；
- Energy；
- fractured Part 数；
- separated Connection 数；
- 当前稳定状态；
- Pause；
- Restart；
- 慢速 0.5×；
- 可以保留 debug sensor 开关。

中文优先。

不要做传统血条。

---

# 17. 第一版不追求真正动物级运动学

我们现在要的是：

> 一个“物理上真的是四足动物结构，并由自己的 Brain 控制身体”的 Leopard prototype。

不要求第一版：

- 像真实豹子一样高速奔跑；
- 完美步态；
- 真实肌肉；
- 真实皮肤；
- 真实捕猎战术；
- 神经网络；
- 学习复杂战斗策略。

允许动作笨拙。

不允许用作弊让动作看起来聪明。

---

# 18. Anti-cheat

完成后重点扫描：

- Arena / AI 读取对手 exact pose；
- direct torso force；
- direct torso torque；
- teleport；
- setVelocity；
- setRotation；
- hidden upright；
- hidden locomotion；
- scheduled combat sequence；
- direct damage；
- grapple weld；
- “命中后固定对方”；
- HP；
- attack stats；
- leopard-specific Physics branch。

如果出现以上任一正常战斗路径，本阶段不通过。

---

# 19. 必须做的真实实验

至少记录以下场景。

### A — 单 Leopard 自主站立

不输入任何外部控制。

要求：

- Brain/Skill 维持或尝试维持身体；
- 不靠 torso 辅助力；
- 至少在短窗口内保持可用姿态，或明确暴露真实失败原因。

### B — 自主寻找另一只 Leopard

两个 Agent 相隔一定距离。

要求：

- 不能读取对手 world pose；
- RangeSensor 感知；
- Brain 选择接近/转向；
- 两者距离总体缩小。

### C — Jaw 自主物理闭合

在近距离交互时：

- Brain 产生 jaw-related motor intent；
- jaw actuator 真实动作；
- 必须发生真实关节变化；
- 是否夹到由物理决定。

### D — 双 Agent 自主接触

无人操作情况下：

- 双方均独立决策；
- 产生实体间真实 contact。

### E — 真实 Damage 改变行为条件

战斗产生 fracture / separation 后：

- Actuator / sensor / body structure 自然受影响；
- Brain 继续基于剩余感知决策；
- Arena 不补偿。

---

# 20. 验收标准

Animal Arena v0.2 通过必须同时满足：

1. Arena 默认不再是 Rammer vs Gripper；
2. 至少有一套可复用 LeopardBlueprint；
3. Leopard 是真实多 Part 四足身体，不是机器人换皮；
4. 头、下颌、四肢、paw、尾巴都属于真实结构；
5. 视觉上明确是一只豹子；
6. 无隐藏身体扶正/推进；
7. 两只 Leopard 都是 Agent；
8. 两个 Brain 独立；
9. Brain 只能从 perception 输入做决定；
10. Arena 不给它们 opponent exact pose；
11. 不需要玩家控制；
12. 双方能自主接近并发生真实身体接触；
13. jaw / limbs 至少有一种能被 Brain 主动使用；
14. Damage 仍来自真实物理；
15. Damage 后身体能力自然变化；
16. 没有 HP / attackPower / biteDamage；
17. 原有 Core / Damage / Energy 回归通过；
18. `npm test`、`npm run typecheck`、`npm run build`、`npm run check:boundaries` 全通过。

---

# 21. 报告

创建：

```
ANIMAL_ARENA_V02_REPORT.md
```

必须明确回答：

1. Leopard 的真实 Part / Connection / Actuator 结构；
2. 哪些地方是物理，哪些只是 Visual；
3. Leopard 如何站立；
4. Leopard 如何移动；
5. Brain 看到了什么；
6. Brain 如何决定；
7. Skill 如何控制身体；
8. 两只 Agent 是否完全独立；
9. 一次真实自主战斗的事件过程；
10. 哪些结果是真正 emergent 的；
11. 有没有发现隐藏作弊；
12. 下一步最重要的一个底层问题是什么。

---

# 22. 工作方式

这是一个完整大任务。

不要再把用户当人工消息中转站。

主代理负责：

- Leopard body design；
- 通用关节/必要最小底层扩展；
- sensors；
- Brain policy；
- motor skill；
- Arena integration；
- autonomous duel；
- anti-cheat audit；
- tests；
- report。

允许使用 `gpt6-luna` 子代理做：

- 四足身体结构审查；
- Rapier joint API 调研；
- anti-cheat 独立审查。

不要建立 verifier 子代理。

完成后：

1. 创建新开发分支；
2. 完整实现；
3. browser smoke；
4. 全量测试；
5. 创建 `ANIMAL_ARENA_V02_REPORT.md`；
6. commit；
7. push；
8. 停止等待独立评审。

---

# 最终验收

**不需要玩家控制，两只有独立感知、独立 Brain 和真实四足身体的 Leopard Agent，能够在 Arena 中自己发现对方、自己做决定、自己控制身体进行接近和身体对抗；所有运动、抓咬、碰撞、损伤和失能仍由通用结构与真实物理决定，而不是战斗脚本或属性系统。**
