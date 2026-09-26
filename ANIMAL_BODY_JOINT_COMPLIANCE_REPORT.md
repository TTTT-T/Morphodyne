# Animal Body：通用多自由度关节与被动顺应性

## 结论与范围

在 `codex/animal-arena-v0.2` 上，Leopard 的四个肩/髋及胸骨盆连接已改为三转动自由度的通用 spherical Connection。关节可声明本地轴上的休止角、弹性、阻尼和可选力矩上限；这套 Core 声明与 Actuator、Sensor 接口不依赖 Rapier，也可用于无 Brain 机器。Leopard 的 Brain 决策逻辑未修改；Motor 使用新增的本体感觉坐标驱动现有意图下的肩/髋俯仰、横滚、偏航及脊柱偏航。20 Part、19 Connection 的身体拓扑不变，关节执行器从 18 增至 27。

## Rapier 0.20 公开 API 调研与实现

- [JointData API](https://www.rapier.rs/javascript3d/classes/JointData.html) 提供 `spherical(anchor1, anchor2)` 和 `generic(anchor1, anchor2, axis, axesMask)`；[关节指南](https://rapier.rs/docs/user_guides/javascript/joints/) 将 spherical 定义为共享锚点的三轴转动。Generic 的 `axesMask` 表示锁住的自由度。`spring` 是两锚点间的线性弹簧，不能直接表达本次所需的角向软组织支撑。
- 本项目锁定 `@dimforge/rapier3d-compat@0.20.0`。本机运行探针确认 `JointData.spherical` 的描述符类型为 Spherical，但 `world.createImpulseJoint` 得到的运行时对象 `type()` 为 Generic，且没有可调用的 `configureMotorPosition`。包内声明与实际运行时不一致。因此使用公开的 spherical 约束作为拓扑，主动轴向输出由 adapter 对两个刚体施加等大反向力矩；不依赖不可用的 joint motor，也没有增加 Leopard 专属物理类型。
- `src/core/model.ts` 增加 spherical 与 `passiveAngular` 声明和 Blueprint 校验；`PhysicsAdapter` 增加可选局部轴。`RapierPhysicsAdapter` 在每个固定步按休止角误差和相对角速度施加成对弹性/阻尼力矩，并把其载荷纳入 Connection 载荷估计。阻尼按两刚体实际逆惯量和步长限制，避免单步把相对角速度反向。`ActuatorRuntime` 仍通过现有有限能量路径输出，`SensorRuntime` 对球形关节提供 `[Z角,Z角速,X角,X角速,Y角,Y角速]`，首对保留既有标量读取约定。
- `LeopardBlueprint` 在肩/髋及躯干使用三轴连接，在膝、踝、颈、颌加入通用被动角支撑；`LeopardMotorRuntime` 调整支撑、对角步态、左右差分和近距离前肢伸展目标。沙盒可创建/编辑 spherical 连接和选定执行器驱动轴；复杂的被动参数仍可通过 Blueprint 编辑。

## 真实物理实验

测试均使用 `WorldRuntime`、Rapier 0.20、固定步、真实 Sensor → Brain → Motor → Actuator → Physics 通路。单豹实验各运行 240 步；冲撞实验先站立 90 步、施加 50 N·s 胸部侧向冲量，再运行 180 步；双豹自动运行 600 步。`src/tools/AnimalBodyTrial.test.ts` 留有可重复的断言和原始测量方法。

| 场景 | 本次通过的物理观测 |
| --- | --- |
| 静止站立 | 胸部全程高于 0.75 m、身体竖直分量高于 0.9，前左足接地超过 160/240 步，能量实际消耗。 |
| 前进 | 匿名前方目标触发自主接近；胸部最终 X 超过 0.75 m（初始约 0.25 m）。 |
| 左转、右转 | 两侧匿名目标分别使胸部朝向角到达小于 −0.15 rad、大于 +0.30 rad；关节输出和地面接触产生转向，没有直接旋转身体。 |
| 被撞后恢复 | 胸部竖直分量受冲量后低于 0.98，随后回到高于 0.99；末端胸部高于 0.75 m，沿冲量方向位移超过 0.5 m。 |
| 双豹自主接近 | 初始胸部距离约 4.1 m；最小距离低于 3 m，实体间接触超过 50 步、头部接触超过 20 步，两边都有独立决策历史。 |
| 近距前肢、头颌姿态 | 交互意图超过 20 步；前肢实际接触对方，前左肩俯仰跨度超过 0.5 rad、颈角跨度超过 0.3 rad；下颌也有真实关节运动和对方接触。 |

新顺应性改变了撞击载荷分布：旧 v0.2 固定回放中的“头部必定断裂”不再成立。本次可重复回放仍记录头部接触、非零冲量及变形。旧 Arena 测试改为验证这些因果结果，而不把特定断裂当作必然结局；独立结构损伤测试仍保留。

## Anti-cheat 与架构核对

已检查本次 diff 和默认 Arena/Leopard/物理路径。未改 Brain 决策模块；Agent 使用自身感知，不读取对手真实位姿。没有 torso upright force、hover、直接推进、teleport、直接改速度/旋转或显式命中/伤害。`RapierPhysicsAdapter` 里的 `setTranslation`、`setRotation`、`setLinvel`、`setAngvel` 只用于原有创建/结构重建路径；正常步进使用关节约束、成对关节力矩、地面和实体接触。测试中 `applyImpact` 仅用于受撞恢复实验。Core 不引用 Three.js/Rapier，非 Agent 机器的三轴及被动回正测试已通过。架构说明已补到 `docs/ARCHITECTURE_v0.1.md`，无既有原则偏离。

## 验证与限制

- macOS：`npm test` 通过，48 个测试文件、179 项测试；其中包含架构边界检查。`npm run build` 通过，包含 TypeScript 无错误检查；`git diff --check` 通过。Vite 仍有既有的大 bundle 警告。
- macOS 浏览器：本机 Vite Arena 可进入、看到两只豹自主运行与能量变化；暂停和重开生效，控制台无 error。Playwright CLI 因 npm registry DNS 不可达而未启动，改由应用内浏览器实测。未做 Windows 验证。
- 这是固定初始条件下的短时身体能力证明：没有 spherical 硬角度限位、可信的持续抓抱或咬合，也未验证更多撞击方向、地形、个体尺寸及长时间稳定性。休止角和刚度是实验参数，尚不是生物力学标定。牙齿、爪与 Contact Concentration 未进入本次范围。

交付分支：`codex/animal-arena-v0.2`，提交后推送同名远端分支，停在评审边界。
