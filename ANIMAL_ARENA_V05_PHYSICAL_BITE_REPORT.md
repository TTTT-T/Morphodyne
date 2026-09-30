# Animal Arena v0.5 — Contact Concentration + Physical Bite

2026-10-01，Mac 实测。从最新 `origin/main` **0b502b5** 创建 `codex/animal-arena-v0.5`。当前 main/NEXT_TASK 已确认 v0.4 合并验收，本阶段没有继续优化 gait。

实现与验收实验已通过，等待独立审查；本报告不表示已合并。

## 实现与因果边界

- `src/core/contact.ts`：backend-neutral ContactPatch；`src/physics/contactArea.ts`：通用几何面积近似。
- `RapierPhysicsAdapter` 从真实 narrow-phase manifold 读取法向、接触点及 normal impulse。一个 manifold 的所有 contact impulse 相加，只使用一个面积；不按 solver contact 数量重复计算面积。`numContacts` 与 `localContactPoint1/2` 按 Rapier 的 flipped 参数对应当前 collider。
- Patch 记录 world point、当前 Part 向外的 normal、`impulseNs`、`forceN`、`effectiveAreaM2`、`pressurePa`、`seconds`。`forceN = normalImpulseNs / substepSeconds`，`pressurePa = forceN / effectiveAreaM2`；Pa = N/m²。point 为冲量加权接触点。零载荷 / speculative 接触不产生 patch。
- `PartContactLoad.patches` 只保留最近一个 world tick 的逐子步样本；它与原有 final-substep `PhysicalContact` 传感器快照的时间语义不同。另一 Entity/Part ID 仅用于 debug 和实验归因，不进入 Agent perception。
- `Material` 增加可选 `yieldPressurePa` / `ultimatePressurePa`，校验正数、有限值及 yield < ultimate。原有 force / torque / impulse 规则保留，旧材料不配置压强容量时等同无限容量。
- `StructuralDamageRuntime` 一次调用 `applyPartLoad`，同时传入旧 contact force/impulse 与新压强；内部 Connection reaction 不增加压强，也不重复损伤端点。Brain / Motor / Arena 没有 Damage 调用。

## effective area 公式、单位与局限

令 collider-local 单位外法向为 n，`d = 0.001 m`，双方分别估计面积，取较小值。面积下限 `1e-8 m²` 只防退化；上界由两侧实际几何 footprint 限制，没有额外攻击倍率。

- **box / convex**：求 support `h = max(n·vertex)`，截取 `n·vertex >= h-d` 的几何层。包含所有层内顶点和穿过截面的顶点连线交点；连线均在 convex hull 内，所有真实边也在该集合中。投影到稳定切平面基底，求二维 convex hull 的 shoelace 面积。Box 使用八个角点，与等形 convex 得到相同结果。正对宽面得到面面积，棱/尖角只得到有限的小面积。
- **sphere**：`d' = min(d,r)`；`A = π(2rd' - d'²)`，即圆形 support cap 投影。
- **capsule**（局部 Y 轴，半柱长 h）：`a = sqrt(2rd' - d'²)`；`L = min(2h,d'/|ny|)`，`ny=0` 时 `L=2h`；`A ≈ πa² + 2aL sqrt(1-ny²)`。端向退化为球冠，侧向增加轴向支撑长度。倾斜 capsule 是同一 support-layer 思路的分析近似，非精确曲面截取。

法向按 collider 当前 rotation 转到本地，因此相同几何/姿态可重复。这个 1 mm 有限表层尺度是显式建模假设，不是材料弹性计算；它不依赖力、弹性模量或真实压陷。双方取 min 尚未求两块 footprint 的精确空间交集，对擦边接触可能高估面积；凸体接触角改变可显著改变面积。不能把当前数值解释为真实牙釉质应力或 Hertz 接触斑。

## 压强如何进入 Damage

每个子步取该 Part 所有 loaded patch 的最大压强。outer-tick `pressurePa` 是这些最大值的时间平均，`peakPressurePa` 是子步峰值。持续超载积分为：

`Δoverload = seconds × max(0, force/yieldForce - 1, torque/yieldTorque - 1, pressure/yieldPressure - 1)`。

使用最强条件，避免同一载荷的 force 和 pressure 两条路径相加计两次。积分到 1 或任何 ultimate 条件达到阈值时 fracture；持续压强使用均值，瞬时 ultimate 使用峰值。既有 transient impulse 路径继续只使用接触冲量增量。压强单独配置的受控目标 `accumulatedImpulseNs=0`，因此以下损伤可明确归因压强路径。

Core 产生 deformation/fracture 事件，fracture 分离所有 incident Connection；WorldRuntime 重新识别组件、执行器及传感器可用性。没有锁定目标、黏接对手或冻结 collider。

## A / B — 宽 vs 窄、材料对照

60 ticks，source 质量 1 kg、初始向下 impulse 2 N·s；同位置、同 0.1 m 接触端半高、同 target 20 kg / box 0.3 m halfExtents、同摩擦/重力/支撑。仅 source box 横向宽面换为 r=0.012 m capsule。弱目标 yield/ultimate = 0.1 / 2 MPa；强对照仅改为 1000 / 2000 MPa。

| 测量 | 宽面 | 窄端 / 弱材料 | 同窄端 / 强材料 |
|---|---:|---:|---:|
| 峰值 patch force N | 248.569 | 247.572 | 247.572 |
| source→target 累计 normal impulse N·s | 13.7205 | 13.7323 | 13.7323 |
| 压强峰值对应面积 m² | 0.09000049 | 0.0000722659 | 0.0000722659 |
| 峰值 pressure Pa | 2761.86 | 3425845.84 | 3425845.84 |
| target deformation | 0 | 1 | 0 |
| target fracture | 否 | 是 | 否 |

载荷近似相同，面积约小 1245 倍、压强约高 1240 倍。相同窄端改变压强容量不会改变运动/接触测量，强材料保持完好。

## C — 没有 Brain 的普通机械 Jaw

普通 frame、upper、revolute jaw、两个 sphere tips、独立 target；普通 ControlSignal 闭合，8 N·m maxOutput，同能量源；120 ticks。没有 Agent、Leopard policy 或结构附着目标。

| 测量 | 弱材料 | 强材料 |
|---|---:|---:|
| 双侧 loaded contact ticks | 98 | 98 |
| jaw relative angle rad | 0.169118 | 0.169118 |
| 峰值 pressure Pa | 190994.30 | 190994.30 |
| 峰值 force N | 41.4018 | 41.4018 |
| 首次损伤 tick（从 0 计） | 14 | 无 |
| deformation | 0.0169054 | 0 |

真实双侧夹持持续约 1.63 秒；载荷和摩擦保持接触，无 weld。另一个相同 fixture 把 upper tip mount 的通用 Connection 容量降低，真实 reaction 使 mount separation、组件由 1 增为 2，双侧接触由 98 降到 31 ticks。损伤改变物理结构及夹持能力。

## D / E — Leopard 的牙齿结构与 blunt 对照

原 20-Part 身体保持原 jaw pose、joint/actuator、Energy 和 gait，增加四颗普通 0.03 kg Part：upper 左右固定到 head，lower 左右固定到 jaw。默认 capsule r=0.012 m、halfHeight=0.025 m，有 collider 和普通可断裂材料，普通 rigid mount。总计 24 Parts。牙齿的 Visual 随自身 Part 运动；删除旧 jaw 内的假视觉牙齿。claw 仍仅视觉，没有新增伤害系统。

blunt variant 只把这四颗 Part 的 geometry 换成 box halfExtents=(0.06,0.037,0.035) m，保留同质量、材料、pose、mount、执行器和能量。单 Leopard + 相同初始口内被动目标；180 ticks，只有 jaw 普通 ControlSignal=1。

| 测量 | toothed | blunt |
|---|---:|---:|
| 实际峰值 jaw output N·m | 18.0 | 18.0 |
| 实际 jaw torque 时间积分 N·m·s | 51.8400 | 51.8400 |
| 压强峰值对应 effectiveArea m² | 0.0000749746 | 0.001217324 |
| 峰值 pressure Pa | 344627.48 | 2353.16 |
| 对应 patch force N | 25.8383 | 2.8646 |
| 双侧 loaded tooth contact ticks | 172 | 1 |
| target deformation | 1 | 0 |
| target fracture | 是 | 否 |

执行器输出相同；实际 contact load 可以因几何/姿态/碰撞阻挡不同而变化，未强行配平。A 已独立证明相近载荷下的面积作用。这里同时展示身体几何改变夹持与载荷传递，未修改 target threshold、Energy 或 maxOutput 来制造结果。

## F — Agent 自主事件链

同一 toothed 身体和初始被动目标，全部普通 Agent 控制。新增口部 0.6 m 匿名 range sensor（head-mounted，5 rays），解决原头部射线看不到口内小目标；Sensor / Brain / Motor 代码和原四种状态均未改。

从 0 计：tick 0 获得近距匿名 range；tick 1 进入 interact；执行器在 172 ticks 有正向实际输出，峰值 9.4381 N·m；180 ticks 内 interact 151 ticks、真实 tooth loaded contact 33 ticks、双侧夹持 25 ticks。峰值压强 120513.11 Pa，tick 13 首次材料变形，最终 deformation 0.0093170，未 fracture。

初始口部摆放也会产生 tick 0 的被动接触，因此不把首次接触当作 Brain 导致的命中。自主闭合后的持续接触、压强超载及 tick 13 的材料响应才是本实验的能力证据。控制端只接收 `readAgentView()`，没有把 target ID 或精确 pose 输入 Brain。

## G — 默认双豹与结构失效

600 ticks：interact 188 ticks，真实对手 tooth loaded contact 6 ticks，峰值 tooth pressure 439948.03 Pa。两只 head 最终 fracture；A 的 lower-left tooth 有 0.0501016 deformation。此次 head 的 sustained overload 为 0，累积 impulse 分别 5.91477 / 6.08156 N·s，所以不宣称 head fracture 由新 pressure path 单独造成：旧接触 impulse Damage 仍工作。Arena 不保证命中或 fracture。

另做牙齿材料脆弱性实验：只把普通 tooth material pressure yield/ultimate 降至 1000/5000 Pa。真实接触使四颗牙 fracture、四个 rigid mount 分离，身体组件变为 5。上牙掉到地面 y≈0.012 m，下牙也成为独立物理体；collider 与有限位置仍存在，jaw 失去原夹持结构。没有无敌牙齿或补偿焊接。

## 回归、Mac/browser 验证与 anti-cheat

最终检查：

- `npm test -- --disableConsoleIntercept`：**53 files / 214 tests 全通过**，11.67 s。包含 v0.4 traction、spherical limits、passive compliance、Energy、旧 external contact Damage、Construction、passive machine 和 Sensor/Brain 边界。
- `npm run typecheck`：通过。
- `npm run build`：通过；Vite 保留已有大 bundle 提示，没有为本阶段引入依赖或拆包重构。
- `npm run check:boundaries`：51 TypeScript files 通过。
- 浏览器实际从沙盒进入 Arena，Three.js 渲染、推进至 81.1 秒、暂停、90 秒结束与重新开始均有效；头部 fracture 后显示每只 1 Part fracture / 4 connections separation，Energy 自然消耗；重置恢复 12000 J 和 0 fracture/separation。控制台 error/warn 0。Windows 未测，不是本阶段必要门槛。
- v0.4 B 未降低门槛：直线 displacement 1.676 m、stanceSlipRatio 0.503、sustained 0.487，四足各 3～5 有效 swing，upright ≥0.989。F 双豹仍有真实 front-limb/head/jaw contact（149/71/251 ticks）。
- 主代理检查实际 diff 和运行结果；gpt6-luna 仅作只读面积方案和 anti-cheat 检查。Core/Physics 没有 Leopard/tooth 分支，没有攻击统计、Brain/Motor/Arena direct-damage、target ID 注入、grapple weld、freeze、teleport 或命中覆盖。测试记录 `applyJointOutput` 后原样转发，没有修改物理结果。

旧测试的必要更新：Part 数 20→24；零接触 load 断言包含新测量字段；2400-tick 多场景回归的本地 timeout 改为 15 s，行为门槛保留。原 v0.2 session“永不接近 fracture”的断言与真实牙齿阶段不再相容，改为检查 fracture 时 incident Connection 和物理 joint 均真实移除，保留原运动、接触和决策证据。没有降低 v0.4 traction 验收阈值。

## 当前限制与交付

最大限制是 rigid-body proxy：面积是几何 support-layer 近似，局部压强只驱动 Part 级 scalar deformation/fracture，并不挖孔、穿刺、改变 collider 形状或生成碎片。牙列只四颗 capsule，姿态/滑脱和接触载荷不同会影响结果。头部旧 impulse 容量在默认对抗中先失效；没有进一步调整战斗或 gait 去保证某种结果。没有偏离架构的语义捷径；上述低保真界限已补入 Architecture §11.1。

实现提交：`627be1a`（generic contact pressure + physical jaw teeth）。证据报告另作独立提交；PR 指向 main，创建后记录 URL。保持在 v0.5 审查边界，不开始下一阶段。用户原有未跟踪 `Untitled.md` 保留且未提交。
