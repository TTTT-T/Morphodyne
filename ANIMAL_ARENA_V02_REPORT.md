# Animal Arena v0.2 — Leopard Agent 自主对抗报告

## 结果与范围

默认 Arena 已改为 `leopard-a` 对 `leopard-b`：两只独立 Agent 从自己的传感器输入作决定，控制各自的关节执行器；World/Rapier 决定运动、接触、能量消耗与结构损伤。Rammer/Gripper 留作旧 fixture。Arena UI 只观察、暂停、重开、结束及调整速度，不给任何一方运动指令。

这是低速、笨拙的四足原型。它能靠物理接触接近和对抗，尚无可信的抓抱或持续咬合；视觉也是分节的风格化动物，没有连续皮肤。

## 身体、物理与视觉

`createLeopardBlueprint()` 生成 20 个真实 Part：胸腔、骨盆、颈、头、独立下颌、3 节尾巴，以及四条各含近端、远端和 paw 的腿。19 个 Connection 包含脊柱、颈、下颌、尾巴、四组髋/膝/踝；18 个普通 Joint Actuator 控制其中的可动关节。8 个 Sensor 包含胸腔本体感知、四足接触、头部/下颌接触和头部前向扇形测距。头、下颌、足和尾巴都有自己的碰撞体、质量与材料；下颌接触不会调用伤害函数。

`LeopardVisuals.ts` 把躯干、四肢、足、长尾、口鼻、耳和斑点分别绑定到对应物理 Part。通用 `ellipsoid` 是 Three.js 外观形状，Core 几何仍为普通碰撞体；可视物件大体收在对应碰撞体内。Part 脱离时，其可视组件随该 Part 移动。尾纹、耳、眼和牙齿只是视觉细节，没有物理攻击属性。

Rapier 0.20 公开声明了 spherical 与 generic joint API；本项目当前 Connection/Joint Actuator 只表达一个标量轴。此版用通用 revolute 串联的髋、膝、踝和脊柱/颈/颌/尾关节；没有为豹子添加专属物理分支。肩髋仍只有矢状面主动自由度，因此侧向转身与前肢包抱能力有限。这是审查过的原型取舍，不等同于已经完成通用多轴 Connection。

## 感知、决策和运动

每只 Agent 各有独立 SensorRuntime、BrainRuntime、MotorRuntime、EnergyRuntime、DamageRuntime 与决策历史。Arena 的 spawn 闭包只把该 Entity 的 `readAgentView()` 交给其 Agent。Brain 读取本体朝向/角速度/局部速度、关节反馈、匿名测距和接触；测距射线排除自身所有 Part，避免把自己的口鼻/腿当作外界目标。物理调试接触可带对方身份以供试验核对，但 AgentPerceptionView 不暴露这个身份。

`EngagementDecisionPolicy` 根据当前感知在恢复姿态、搜索转向、接近匿名回波和近距离交互之间选择。`LeopardMotorRuntime` 把意图映射成髋/膝目标角、踝输出、脊柱/颈/下颌控制；对角腿的相位驱动与左右差分产生前进和转向尝试。站立时同一层用关节反馈调整支撑姿态。没有胸腔扶正力、直接推进力、位置/速度覆写或按时间表执行的战斗动作。可视上它常下沉、点头或滑移；这是当前关节/接触模型的真实表现。

## 实验与事件

| 实验 | 当前证据 |
| --- | --- |
| A 单豹站立 | 120 个固定步无外部控制；胸腔最低高度高于 0.45 m，前足有超过 30 步地面接触，能量实际消耗；Agent 持续根据本体感知发关节信号。 |
| B 自主寻找 | 两只豹从相隔约 4.1 m 出发；头部 RangeSensor 提供匿名回波，两个 Brain 选择接近/转向；600 步内胸腔最小水平距离低于 3.6 m。 |
| C 下颌 | 近距离交互意图令 jaw actuator 改变真实关节角，实测角度跨度大于 0.2 rad；在当前偏轴对抗中，下颌在头部断裂前接触了另一 Entity。是否形成持续夹持仍未证明。 |
| D 双 Agent 接触 | 两边都有独立决策历史；自动运行的 600 步中出现跨 Entity 的头/身体接触，接触由 Rapier 记录，超过 30 个步发生实体间接触。 |
| E 损伤后继续 | 头部接触载荷积累并发生变形，随后头部 Part 破裂、颈头及颌连接分离；头部测距随结构脱离从 Agent 感知中消失。Brain 继续基于剩余输入作决定，Arena 不补偿丧失的结构。 |

一局固定初始条件下，双方先看到前向回波并接近；头部及躯体发生真实接触，近距离策略随后尝试颈/下颌和前肢控制。实测下颌曾碰到对方，头部在反复载荷后破裂；断开后失去头部测距，策略转为寻找/恢复。这些接触、变形、断裂及感知损失是结构、材料、控制与物理共同产生的结果，不是 Arena 的命中判定。固定初始条件的回放可复现；不同碰撞姿态的结果仍需更多实验。

## Anti-cheat 与限制

扫描了正常 Arena、Agent、Motor 和物理路径：Agent 不读取 `opponent.position`、对手 `readPartPose()` 或对方 Entity ID；`ArenaObserver` 读取精确位置仅供 UI 观察。未在对抗路径发现直接 torso force/torque、teleport、`setVelocity`/`setRotation`、隐藏扶正、直接伤害、抓抱 weld、HP 或攻击属性。旧 `ArenaOpponent` 的精确位姿控制仍在 v0.1 fixture 文件内，默认 Arena 不实例化它。

当前接触常集中在头、颌和一侧前肢，四足步态、侧向转向与持续夹持都不稳定。头部损伤材料阈值用于第一版因果试验，不能解读成真实动物生物力学。最重要的下层问题是建立 backend-neutral、可感知可驱动的多轴 Connection/Actuator 与被动顺应性，使肩髋及躯干能自然支撑、转向和调整接触姿态；不能用身体级捷径掩盖此问题。

## 验证

- macOS：`npm test` — 45 个测试文件、171 个测试通过；`npm run check:boundaries` 通过。
- macOS：`npm run typecheck`、`npm run build` 通过。Vite 的既有大 bundle 警告不影响构建结果。
- 浏览器：本机 Vite Arena 进入、无人控制运行、暂停/继续、重开、0.5×、结束状态及双 Agent 观察卡已实测；控制台无 error。未做 Windows 验证。
