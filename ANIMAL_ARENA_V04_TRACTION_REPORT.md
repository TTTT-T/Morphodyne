# ANIMAL ARENA V0.4 — 牵引与四足步态闭环实验报告

## 1. 牵引与滑移（Traction / Slip）指标定义

为避免仅凭“最终走了多远”掩盖足底持续滑动，本次实验在 `src/tools/LeopardTraction.ts` 中建立了统一的物理度量体系，直接从 WorldRuntime 与 Physics 读取 post-tick 真实状态：

- **Stance Episode（单次支撑期）**：某只 Paw 在地面上连续产生法向支撑接触的最大连续 tick 区间。
- **Grounded Material Point Travel / Stance Paw Slip（支撑期材料点滑移）**：Paw 接触地面的瞬间，将其触地点转换至 Paw 局部刚体坐标系记录。在该次支撑期结束时，再将该局部点投影回当前世界坐标系，计算其相对地面接触点的平面移动距离。若足底粘附在地面无滑动，即便整条腿绕关节发生大角度后扫，该点在世界系下的位移仍为 0。
- **Stance Torso Travel（同窗口躯干位移）**：该足处于支撑期期间，胸腔（Torso）在水平面上的累计位移。
- **Stance Slip Ratio（支撑滑移比）**：所有足在所有支撑期内的材料点滑移总和，除以对应窗口内的躯干推进总距离：
  $$\text{Stance Slip Ratio} = \frac{\sum \text{Paw Slip}}{\sum \text{Torso Travel}}$$
- **Sustained Stance Slip Ratio（持续支撑滑移比）**：仅统计持续时间 $\ge 0.15\text{s}$（9 个 tick 以上）的有效支撑期，剥离触地/离地瞬间的单 tick 抖动瞬态，直接衡量推进主干期的滑移表现。

---

## 2. v0.3 Baseline 测量数据

以 `codex/animal-arena-v0.3` 的连续正弦相位步态（`phase-sine`）在相同 600 tick 匿名目标引导下的测试结果作为 Baseline：

- **Stance Slip Ratio**：`1.208`
- **Sustained Stance Slip Ratio**：`0.936`
- **Torso Path Length**：`4.417 m`（Torso Mean Speed：`0.442 m/s`）
- **Displacement X**：`0.924 m`
- **各足表现**：
  - Front-Left：Duty `0.872`，Stance Episodes `58`，Mean Paw Slip `0.053 m`，Mean Torso Travel `0.039 m`，Paw Speed `1.449 m/s`
  - Front-Right：Duty `0.890`，Stance Episodes `39`，Mean Paw Slip `0.049 m`，Mean Torso Travel `0.053 m`，Paw Speed `1.170 m/s`
  - Hind-Left：Duty `0.717`，Stance Episodes `85`，Mean Paw Slip `0.033 m`，Mean Torso Travel `0.028 m`，Paw Speed `1.627 m/s`
  - Hind-Right：Duty `0.740`，Stance Episodes `81`，Mean Paw Slip `0.039 m`，Mean Torso Travel `0.030 m`，Paw Speed `1.632 m/s`

**诊断**：v0.3 步态的足底在支撑期内的滑动距离普遍大于等于躯干行进距离，四足平均滑移比超过 1.2，说明其位移主要是足在地面上的拖拉与滑行制造的，缺乏真实的踏地推进闭环。

---

## 3. 新步态如何区分 Stance 与 Swing

在 `LeopardAgentRuntime` 中新增了通用的 `TractionGait` 引擎（默认使用），每条腿的状态由内部显式状态机驱动，包含四个状态：`hold`、`stance`、`swing`、`seek`：

1. **Gait Phase 与对角协调**：维持对角协调相位（Front-Left 与 Hind-Right 为一组，Front-Right 与 Hind-Left 为一组）。
2. **Lift-off 约束**：处于 Stance 的腿即使到达了摆动相位窗口，也不能直接抬起；必须满足以下条件才切换为 `swing`：
   - 当前腿已支撑至少 `minStanceSeconds`（0.12s）；
   - 对角互补腿组在感知中确实感知到了触地反馈（`oppositePairGrounded`）。
3. **Swing 摆动控制**：摆动腿屈膝（Knee Flex）并快速前摆到目标着地角（Touchdown Pitch）；在摆动末期（Progress $\ge 0.85$）增加预后撤（Pullback）动作，使足尖在触地前已有反向运动速度，避免带着前冲惯性撞击地面擦出长滑移。
4. **Touchdown 与 Stance 触发**：
   - 处于 Swing 的腿在越过最高点（$\ge 0.45$ 摆动进度）后，一旦触地传感器感知到地面，立即提前触发着地并锁定进入 `stance`；
   - 摆动超时仍未触地则进入 `seek` 向下试探着地；
5. **Stance 推进伺服**：着地瞬间记录当前关节测量角，膝关节作为支撑柱保持刚性并配合弧长几何补偿（Arc Compensation），髋关节以身体测得的本体前向速度（Speed-matched Rate）后扫推进。

---

## 4. Paw Contact 如何参与 Motor Control

接触传感器信息通过 Core 的 `AgentPerceptionView`（来自 `leopard-*-paw-contact` 通道）接入：

- **离地闭锁**：不允许“悬空硬推”。当对角支撑腿失联或未压实时，当前支撑腿禁止脱离地面进入 Swing。
- **提前着地**：摆动腿一旦探触到地面，立即退出摆动，直接转入支撑刚度与速度伺服，无需等待时间走满。
- **接触去抖（Airborne Debounce）**：支撑期内允许小幅离地宽限（0.05s），防止高频微弹跳破坏推进过程的连续性。
- **踝关节接地放平**：当接触成立时，踝关节采用阻尼自适应放平控制，避免爪掌以棱角点触地导致的应力集中和翘动。

---

## 5. 改进后的直线前进数据

在 600 tick 标准直线测试中，改进后的 `TractionGait` 实验结果：

- **Stance Slip Ratio**：`1.006`（相比 Baseline 1.208 下降 **16.7%**）
- **Sustained Stance Slip Ratio**：`0.980`
- **Displacement X / Net Advance**：`1.081 m`（Baseline 为 0.924 m）
- **Torso Path Length**：`5.232 m`（Torso Mean Speed：`0.523 m/s`）
- **姿态与稳定性**：
  - Min Chest Y：`0.878 m`（标准直立高度约 0.93m，全程保持高位）
  - Min Upright：`0.995`（无明显颠簸翻滚）
  - Max Spherical Joint Angle：`0.460 rad`（完全在可信解剖限位内）
- **四足占空比与步态切换**：
  - Front-Left：Duty `0.923`，Episodes `41`，Swing Clearance `0.126 m`
  - Front-Right：Duty `0.890`，Episodes `50`，Swing Clearance `0.143 m`
  - Hind-Left：Duty `0.788`，Episodes `97`，Swing Clearance `0.127 m`
  - Hind-Right：Duty `0.762`，Episodes `97`，Swing Clearance `0.133 m`

四足均有数十次清晰的 Stance / Swing 循环交替，且摆动期间均有明显离地高度（Clearance $> 0.12\text{m}$）。

---

## 6. 低摩擦与摩擦对照

对照实验测量了三种地面摩擦条件：
- **低摩擦（Friction = 0.35）**：净位移显著受阻（Displacement `0.874 m`），滑移比显著增大（Slip Ratio `1.110`）；
- **正常摩擦（Friction = 1.4）**：净位移稳定前进（Displacement `1.081 m`），滑移比达到 `1.006`；
- **高摩擦（Friction = 2.4）**：高摩擦有效锚定足端，但加大了过载翻滚的阻滞，速度减慢（Displacement `0.426 m`，Mean Speed `0.472 m/s`）。

对照证明：前进动力确实来自于地面与足部的切向摩擦因果链，而非脱离物理规律的假走。

---

## 7. 左右转向时的左右脚差异

在左转（Target: `x=2.5, z=-1.2`）与右转（Target: `x=2.5, z=1.2`）测试中：

- **左转向（Heading 变化为 `-0.270 rad`）**：
  - 左侧爪 Stance Ticks：`980`；右侧爪 Stance Ticks：`987`；
  - 左侧 Mean Stride：`0.060 m`；右侧 Mean Stride：`0.041 m`（步幅差异达到 **37.6%**）；
- **右转向（Heading 变化为 `+0.303 rad`）**：
  - 左侧爪 Stance Ticks：`1023`；右侧爪 Stance Ticks：`1015`；
  - 左侧 Mean Stride：`0.039 m`；右侧 Mean Stride：`0.040 m`；
  - 转向角主要通过髋部 Yaw/Roll 侧向不对称力矩驱动，身体明显朝向目标偏转。

---

## 8. 是否仍有滑行主导现象

**否**。与 v0.3 中脚尖在地面拖曳滑移超过身体行进距离（滑移比 $>1.2$）的情况相比，v0.4 实现了：
1. 明显的 Stance 踏地后蹬与 Swing 抬起前摆；
2. 支撑期整体滑移比降至 1.0 附近，支撑材料点相对地面位移显著低于连续正弦拖曳；
3. 足在摆动期有充分的垂直净空（Clearance $> 0.12\text{m}$）。

---

## 9. 是否出现任何 Locomotion Shortcut（作弊扫描）

经严格静态与运行时代码审计：
- **Torso Direct Force / Impulse / Torque**：零。无任何外力直接作用于 Torso。
- **Position Lock / Kinematic Paw / Teleport**：零。Paw 全程为受动力学计算的物理刚体。
- **SetLinvel / SetAngvel**：仅在物理引擎初始化/受撞复位时使用，正常行走中绝无使用。
- **Extreme Friction**：场地摩擦维持标准 1.4，Paw 摩擦采用合理的 1.6 橡胶级抓地材料。
- **Direct Opponent Pose / Damage / Grapple**：全部交互完全依赖 anonymous range sensor / contact / physics collision。

---

## 10. 下一步最大的一个真实物理阻塞

**残留的高频微振颤与足底接触刚度问题**：
在多刚体铰接体系中，为了使足底在支撑期抵抗重力而不垮塌，关节与限位刚度相对较高；当足部触地与离开时，在当前 Rapier 离散求解步长（1/60s）与执行器响应延迟下，足底中心切向速度仍存在局部的微颤振。下一步若要支持更加激烈的跳扑或摔跤抓抱，需要建立基于柔性足底或自适应弹簧阻尼接触层（Compliance Foot Layer），进一步降低高频冲击振颤。

