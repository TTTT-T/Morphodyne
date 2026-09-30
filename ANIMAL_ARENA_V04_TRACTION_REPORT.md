# Animal Arena v0.4 — 牵引收口验收通过

2026-09-30，Mac。任务来源：最新 `origin/main:NEXT_TASK.md`（`4209d4c`）。工作分支 `codex/animal-arena-v0.4`，收口前 HEAD `f7f41ce`。本次只完成 v0.4，提交并推送后停在评审边界，不进入下一阶段。

## 原因与修复

原默认控制重现整体/持续滑移比 1.003/0.980，累计材料点滑移比 3.552/4.621，early/mid/late 滑移均严重。原报告“不再滑行主导”证据不足。

首先隔离出通用被动角支撑数值不稳定：无 Agent、执行器和地面的轻关节受到一次 0.025 Nm·s 冲量后，旧适配器峰值角速度 95.518 rad/s；当前峰值 0.606 rad/s，120 tick 后 0.000029 rad/s。新增回归曾在旧源码上实际失败。修复按被动刚度与相对逆惯量选择内部子步，保持 k×Jinv×dt²≤0.5。每子步重算支撑/限位；连续力覆盖整 tick、冲量只施加一次；接触载荷积分所有子步，几何和点冲量仍为末子步快照。World、Sensor、Brain、Energy、Damage 外层调度不变，普通无刚性支撑结构维持单步。

稳定积分后旧控制曾四足不离地、推进仅 0.061 m，因此不能凭低滑移宣称通过。后续通过真实足部几何和关节控制恢复周期性牵引：

- Paw 半长 0.28→0.14 m，半高/半宽 0.07/0.14 m、质量 0.28 kg 不变；较长 pad 在关节转动时仍会以边缘接地。隔离单前足实验在同样关节目标下，短 pad 末段足底离地约 0.066 m，长 pad 约 0.012 m。该实验仅诊断几何，最终验收使用完整默认身体与原能量限制。
- 髋 pitch 支撑 110→65、膝 65→32、踝 45→18 Nm/rad；膝/踝 damping 12/10→4/2，踝范围 ±0.6→±0.9 rad。髋/脊柱 spherical limits、执行器最大扭矩、响应时间 0.12 s、正常摩擦和能量限制不变。视觉足垫/爪调整到真实 collider 内。
- Motor 用自身两段腿长和本体关节角生成目标，通过普通 Actuator 补偿被动弹簧并施加有限扭矩。站立支撑下移量 0.70 m，swing 抬升目标 0.14 m，周期 0.5 Hz；实际持续失去 paw contact 后才前摆，85% swing 时段后才接受 touchdown。
- 修正对角支撑查询，要求另一对角的两足接地；每个 swing window 最多启动一次。恢复/hold→运动时同时捕获当前 hip/knee 并清空旧 sweep，避免陈旧锚点导致目标突跳。
- Stance 从实测 touchdown 腿角开始，以自身速度匹配 0.14–0.24 m/s 回撤，协调膝伸展和踝调平；hind 使用自身脊柱角。修正 yaw 阻尼符号。近距离交互仍保留前足步态支撑，头颌继续按 Brain 意图控制。
- 头部匿名 range sensor 移到口鼻下方 `(0.24,-0.14,0)`、略向下 `(1,-0.15,0)`；范围/FOV/分辨率不变。真实射线测试证明左右低目标在两种出生朝向均可见。未新增 Brain 功能或读取对手真值。

生产修改集中在 RapierPhysicsAdapter、LeopardAgent、LeopardBlueprint、LeopardTraction 与足部 Visual；架构文档记录积分边界。新增轻关节/输入守恒、观察器/几何 clearance、传感射线回归，并加强原验收，未放宽行为门槛。

## 正常摩擦下最终结果

同一当前后端、同一当前身体、600 tick，floor=1.4、paw=1.6。phase-sine 原控制保留作独立 baseline，B 显式生成，不依赖 A 测试执行顺序。旧积分结果不能与新积分数字直接相减。

| 指标 | phase-sine baseline | traction | 门槛 |
| --- | ---: | ---: | --- |
| 前向位移 | -1.593 m | 1.707 m | >0.8 m |
| stanceSlipRatio（净端点） | 1.531 | 0.532 | ≤0.80，较 baseline 降≥20% |
| sustainedStanceSlipRatio（≥0.15 s） | 1.525 | 0.534 | ≤0.80，较 baseline 降≥20% |
| 累计材料点 slip / torso 净推进 | — | 1.157 | 额外诊断 |
| 持续 episode 累计比例 | — | 1.162 | 额外诊断 |
| 最低 chest Y / upright | — | 0.819 m / 0.988 | >0.5 / >0.90 |
| 最大 spherical angle | — | 0.820 rad | 原限位回归通过 |

净端点整体/持续比例分别下降约 65.3%/65.0%。但累计比例仍大于 1，不能声称整个接触阶段无滑行；late stance 残留明显滑移。

| Paw | contact duty | 有效 swing | 平均峰值足底 clearance |
| --- | ---: | ---: | ---: |
| FL | 0.735 | 5 | 0.091 m |
| FR | 0.733 | 5 | 0.074 m |
| HL | 0.720 | 4 | 0.094 m |
| HR | 0.788 | 3 | 0.087 m |

有效 swing 必须持续离地≥0.05 s、整个旋转 box 的最低点高于地面>0.05 m，并重新接地。观察器按实际 box 三轴投影计算最低点；中心高度或角度模式不能代替 clearance。旧 meanSwingClearance 为绝对中心高度，仅兼容保留；meanSwingLift 为中心增量，足部从倾斜转平时它可能小于实际足底抬升。单元测试专门覆盖这两种误判。

## 滑移分解和锚定分布

同一 touchdown paw-local 材料点逐 tick 累计路径，不能用净端点抵消掩盖往复滑移。仪器保存每 episode touchdown 前3 tick、后3/6/12 tick、early/mid/late，包含 paw/torso 速度、hip/knee/ankle rate、持续时间及整 tick 接触冲量 proxy；每足和全局都有分布。完整原始读数由 B 测试可重复输出。

| 阶段 | 累计 slip 合计 | paw / torso 平均速度 | 接触冲量合计 |
| --- | ---: | ---: | ---: |
| touchdown 前3 tick | 0.636 m | 0.490 / 0.211 m/s | 0 Ns |
| early | 1.680 m | 0.271 / 0.302 m/s | 1011.223 Ns |
| mid | 0.645 m | 0.114 / 0.326 m/s | 1073.711 Ns |
| late | 3.374 m | 0.452 / 0.308 m/s | 525.554 Ns |

Mid 承载阶段 paw 速度明显低于 torso，late 最差：卸载/抬腿前仍有滑移，touchdown 也未达到零切向速度。不能将净端点验收通过扩大成完美无滑移步行。

Anchoring efficiency 按累计材料点 slip 与 torso 净 travel 定义；无 travel 的 episode 排除，负值截到0。27个 episode 全局 travel 加权均值0.186，median0、p75=0.308、p90=0.485；26个持续 episode 为0.183、0、0.290、0.422。该分布明确保留较差 episode，未只挑稳定中段。

## 摩擦、转向、恢复和双体接触

| floor friction | stanceSlipRatio | 位移模长 | 前向位移 |
| --- | ---: | ---: | ---: |
| low 0.35 | 0.627 | 1.484 m | 1.472 m |
| normal 1.4 | 0.532 | 1.708 m | 1.707 m |
| high 2.4（对照） | 0.429 | 1.723 m | — |

低摩擦滑移增加且推进下降，正常组未提高摩擦。左/右 heading=-0.246/+0.314 rad，左右 stance tick 为840/990与1020/868，真实接触支撑不对称。600 tick 站立、两种冲击恢复、Energy、Damage、spherical limits 均继续通过。

双豹 F 从 torso gap4.144 m 接近到2.487 m；A→B、B→A各259 contact tick，front106、head19、jaw259。统计逐 Entity 和 owned Part 且要求正冲量，避免实体归属含糊。双方独立 anonymous perception→Brain→Motor→Actuator；相遇后的滑移比1.141为双体相互推挤诊断，正常行走门槛使用单体 B。

## 验证与交付

- `npm test -- --disableConsoleIntercept`：51 files，206/206 passed；包括 `check:boundaries`。最终运行约6.85 s。曾与浏览器实时物理并行导致一项超过默认5 s超时；关闭浏览器负载后完整通过，未提高测试时限。
- `npm run typecheck`、`npm run build`、`git diff --check`：通过。
- Mac 浏览器实际进入 Arena，自主接近与接触可见；90秒自动结束、重开、暂停、0.5×选择均有效，控制台 error/warn为空。90秒局能量耗尽及真实断裂可发生，这不是无限耐力保证。
- Windows 未运行；不声称跨平台位级确定性。
- Anti-cheat：Agent 无直接 torso force/impulse/torque、世界足锁定、kinematic、pose/velocity setter、teleport、对手真值或极端正常摩擦。Core 无物种能力标志，数值子步由通用物理声明决定。原30 tick支撑恢复断言未放宽。
- 未保留失败原型、临时诊断测试或无关修改；用户 `Untitled.md` 保留且不提交。

所有最新 NEXT_TASK 的硬门槛和相关回归已通过，可以提交 `fix(arena): close v0.4 traction acceptance` 并推送指定分支，PR针对main等待评审。累计late滑移是已测量的限制，本次不继续调参或进入牙齿/爪/Contact Concentration/战斗AI/下一阶段。提交SHA和PR链接记录于交付信息。
