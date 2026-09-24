# NEXT TASK — v0.2 Phase 13：可操作造物沙盒垂直切片（Playable Construction Sandbox）

Phase 12 已通过并合并。

Phase 13 是 v0.2 的收尾阶段。

本 Phase **不新增新的物理能力系统**，目标是把已经验证过的：

- Part / Material / Connection
- Joint Actuator / Tension Actuator
- finite Energy / Power
- Physics
- Structural Load
- Damage / Separation / Repair
- Construction Runtime

真正组合成一个普通用户可以直接操作、观察因果结果的 Morphodyne Sandbox。

核心目标：

> 用户不需要写代码，也不需要编辑 JSON，就能通过“改结构 → 施加控制 → 看物理结果”体验到“结构产生能力”。

---

## 1. 产品定位

Phase 13 不是做漂亮游戏 UI，也不是完整 3D CAD。

它是第一个真正可操作的 Morphodyne 垂直切片。

成功体验应该是：

```text
选择一个基础结构
→ 修改结构 / 几何 / 执行器
→ 设置控制
→ 运行物理
→ 看它是否实现目标
→ 查看能量 / 载荷 / 损伤
→ 修改结构再次尝试
```

重点是让因果链对用户可见。

---

# 2. 中文优先

当前 God Sandbox 已有中文基础，本 Phase 必须继续保持。

核心操作界面不要出现必须理解的英文技术标签。

可以保留英文 ID / debug 字段，但用户主要看到的应是中文，例如：

- 部件
- 连接
- 材料
- 执行器
- 拉力执行器
- 关节执行器
- 能量
- 剩余能量
- 功率上限
- 载荷
- 损伤
- 修复
- 暂停
- 单步
- 重置

不要要求用户通过 Blueprint JSON 才能完成主流程。

JSON 保留为高级功能即可。

---

# 3. 不允许的做法

禁止为了“好玩”加入：

- `canLift`
- `canGrip`
- `canWalk`
- `machineType`
- `success=true`
- scripted lift / grip
- 预设动画
- teleport
- direct transform control
- outcome-specific constraints
- UI 直接修改 Rapier state
- UI 直接制造 Damage

UI 只能调用已有 World / Construction / Control 边界。

物理结果仍必须来自：

```text
Structure
→ Actuator
→ Energy
→ Physics
→ Structural Load
→ Damage
```

---

# 4. Phase 13 核心体验

至少提供一个明确的“实验台 / 工作台”场景。

场景里可以有：

- 地面
- 独立被操作物 / payload
- 一个可编辑的基础机械结构
- 必要的静态支撑

不要做剧情、任务系统或关卡系统。

可以提供简单目标提示，例如：

> 尝试让结构把方块抬起来。

但“成功”不应反馈给物理系统。

---

# 5. 基础模板

至少提供三个结构模板，全部仍然只是普通 Blueprint：

1. **基础关节机构**
   - Part + revolute/prismatic Connection
   - Joint Actuator

2. **基础拉力机构**
   - 使用 Tension Actuator
   - attachment points 可编辑

3. **基础夹持机构**
   - 类似 Phase 12 的 generic gripper
   - payload 始终是独立 passive Entity

模板只是方便开始，不是 Entity 类型。

禁止：

```text
EntityKind.Gripper
EntityKind.Lifter
```

---

# 6. Construction UI 必须能完成的操作

核心操作必须通过中文 UI 完成。

至少支持：

### Part

- 选择 Part
- 查看位置、尺寸、质量、材料
- 修改质量
- 修改基础几何尺寸
- 添加 Part
- 删除 Part

不要求做自由拖拽建模器。

数值输入 + 明确按钮即可。

### Connection

- 添加 Connection
- 删除 Connection
- detach
- reattach
- 查看连接种类
- 修改 anchor
- 对 revolute / prismatic 修改 axis / limits

### Actuator

必须完整支持：

- 添加 Joint Actuator
- 添加 Tension Actuator
- 删除 Actuator
- 修改 maxOutput
- 修改 response time
- Tension Actuator 两端 Part
- Tension attachment points

**Phase 10 已支持 Tension，但旧 UI 主要还是 Joint；Phase 13 必须把 Tension 正式带进可操作 UI。**

### Material

至少允许修改：

- friction
- density 或 mass 相关可见参数
- Phase 9 的核心结构阈值可作为“高级”字段展示

不要求完整材料编辑器。

---

# 7. 通用 Actuator 控制台

这是 Phase 13 的关键功能。

用户必须能直接控制任意 Actuator，而不是依赖 Agent 或写 control callback。

实现一个通用 Manual Control Source / Sandbox Control Runtime。

UI 对当前 Entity 的 actuator 列表提供控制。

Joint Actuator：

```text
-1 ← 0 → +1
```

Tension Actuator：

```text
0 → 1
```

可以使用：

- slider；
- 数值输入；
- 按钮。

控制信号必须继续通过：

```text
ControlSignal
→ ActuatorRuntime
→ Energy
→ Physics
```

禁止 UI 直接调用 `applyJointOutput` 或 `applyForceAtPoint`。

Manual Control Source 必须只是普通 WorldControlSource。

---

# 8. Energy UI

用户必须能看懂当前结构是否“有力但没能源”。

至少显示：

- 容量 J
- 剩余 J
- 已消耗 J
- 功率上限 W
- 当前机械功率 W
- efficiency

对于 Sandbox 创建的 actuated Entity，需要有明确、有限的 Energy Supply。

第一版可以在“生成 / 重置结构”时设置 Energy：

- capacityJ
- maxPowerWatts
- efficiency

如果现有 WorldRuntime 不支持运行中替换 Energy，不要为了 UI 硬改复杂 energy network。

允许：

```text
修改 Energy 配置
→ 明确重置 / 重生成该 Entity
```

但界面必须讲清楚。

禁止恢复无限 Energy 默认路径。

---

# 9. 结构与物理可观测性

选中 Entity / Part / Connection 后，界面至少应能看到与理解：

### Entity

- Part 数量
- Connection 数量
- Actuator 数量
- Energy 状态

### Connection

- connected / separated
- 当前 Damage state
- deformation
- 当前/最近 force N
- 当前/最近 torque N·m

如果当前 PhysicsAdapter 在 connection 被打断后不能再提供 load，UI 可以显示：

```text
已分离 / 当前无载荷读数
```

不要伪造最后峰值。

### Part

- 当前位置
- 当前速度（如低成本）
- material
- mass

debug 数据可以折叠到“高级信息”。

---

# 10. Damage 与 Repair

保留并整理现有：

- 外部冲击
- Damage 状态
- repair

要求：

用户可以：

```text
让结构运行
→ 施加真实冲击
→ 看连接断裂 / 功能下降
→ Repair
→ 再次运行
```

Repair 必须继续走现有 Construction repair / reconstruction 路径。

禁止 UI 直接把 damage state 改为 intact。

---

# 11. 编辑与运行模式

为了避免用户边运行边改结构造成难以理解的问题，UI 明确区分：

### 编辑模式

- 暂停 physics
- 修改结构
- reconstruction

### 运行模式

- 结构编辑按钮禁用或提示先暂停
- actuator controls 可用
- physics 正常运行

不需要复杂状态机。

规则简单、明确即可。

---

# 12. Reset / Undo 范围

至少提供：

- 重置当前模板
- 重新生成场景

不要求完整 Undo/Redo 历史。

不要为了 Undo 系统扩大 Phase。

---

# 13. 可视化要求

当前 Three.js 渲染继续使用。

本 Phase 只增加真正有价值的物理可视化：

### 必须

- 选中 Part 高亮
- Connection / actuator 在视觉上可以定位
- Tension Actuator 最好显示两 attachment points 之间的线
- separated Connection 有明显状态

### 可选

- force arrow
- torque indicator
- sensor ray

不要为了美术效果阻塞 Phase。

不要导入大型 3D asset pipeline。

---

# 14. 默认 Sandbox 行为

打开页面后不能自动乱跑。

默认：

- physics 可以运行；
- actuators control = 0；
- Agent autonomous 不应抢夺当前 Sandbox Entity 的控制。

当前 quadruped 可以：

- 移到独立 demo 区；
- 或默认不作为主 Sandbox 结构。

不要让四足 Agent 成为 Phase 13 的中心。

---

# 15. 至少一个完整用户实验

Phase 13 验收必须做真实 browser smoke。

流程建议：

1. 打开 Sandbox；
2. 选择基础拉力机构；
3. 运行原结构并记录结果；
4. 暂停；
5. 通过 UI 修改 Tension attachment point；
6. 恢复运行 / 重置后运行；
7. 使用同样 actuator signal；
8. 观察运动结果明显变化；
9. 查看 Energy consumption；
10. 施加冲击导致结构 Damage；
11. 再运行，观察功能变化；
12. Repair；
13. 再运行，功能恢复。

整个核心流程不能要求：

- 修改源代码；
- DevTools；
- JSON 编辑。

这就是 v0.2 最重要的人类验收。

---

# 16. 第二个 browser smoke：夹持

用基础夹持机构：

- payload 是独立 Entity；
- 用户启动 jaw actuator；
- 高摩擦配置下能够物理保持 payload；
- 修改 friction 后，结果变化。

不需要自动判定“成功”。

只需要：

- 物理结果可观察；
- contact / position / Energy / load 可查看。

---

# 17. Production Boundary

God Sandbox UI：

- 负责输入和显示；
- 不拥有世界规则；
- 不计算 capability；
- 不决定 damage；
- 不决定 grip；
- 不决定 lift。

所有真正修改必须通过：

- ConstructionRuntime
- WorldRuntime
- ControlSignal

如果 UI 需要一个 facade / controller，可建立 Tools 层的：

```text
SandboxController
ManualControlSource
```

但它不能复制 Core / Physics semantics。

---

# 18. 不要做的内容

Phase 13 不做：

- 完整建模软件
- 拖拽 gizmo 编辑器
- 复杂材质库
- 动物创建器
- 角色系统
- 任务 / 成就
- Brain 扩展
- AI 自动造物
- natural language creation
- ecology
- evolution
- multiplayer
- save cloud
- large world

Blueprint JSON save/load 可以保留现有能力。

---

# 19. Tests

除 browser smoke 外，新增/更新自动化测试覆盖：

- Manual Control Source 只产生 ControlSignal；
- Tension actuator UI/config data round trip；
- Construction UI 对 Tension 不丢字段；
- Energy inspection；
- edit/run mode guard；
- reset/reconstruction 不直接修改物理 outcome；
- existing Phase 9 / 10 / 11 / 12 regressions。

完成前运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:boundaries
```

---

# 20. v0.2 防作弊审计

Phase 13 完成后做一次 v0.2 总扫描。

重点搜索：

- `canWalk`
- `canLift`
- `canGrip`
- `attackPower`
- `moveSpeed`
- `liftCapacity`
- `gripStrength`
- `EntityKind`
- UI 直接访问 Rapier
- Tools 直接修改 pose / velocity
- actuator 直连 Damage
- energy 直连 movement outcome

对命中的每项说明：

- 正当使用；
- 测试文字；
- 或需要删除。

---

# 21. 报告

创建：

```text
PHASE13_REPORT.md
```

必须记录：

1. Sandbox 主流程；
2. 新增 UI 功能；
3. Manual Control 的数据流；
4. Tension editing；
5. Energy inspection；
6. Damage / Repair；
7. 两个 browser smoke 的实际结果；
8. 自动测试结果；
9. v0.2 anti-cheat audit；
10. 已知 UX / physics 限制。

---

# 22. v0.2 完成条件

Phase 13 通过后，v0.2 才算正式完成。

v0.2 的成功标准不是“有更多功能”，而是：

> 用户能在一个真实运行的沙盒里，仅通过修改通用结构、材料、执行器和能量配置，让一个 Entity 的实际物理能力发生变化；损伤能够让能力下降，修复能够恢复，而系统从未给 Entity 写入 `canX` 能力。

---

# 23. 工作方式

这是一个完整 Phase。

不要要求用户在多个小步骤之间传话。

主代理负责：

- UI / Tools architecture
- implementation
- browser smoke
- automated tests
- v0.2 anti-cheat audit
- final integration review

可使用 `gpt6-luna` 子代理完成边界清晰工作。

不要建立专门 verifier 子代理。

不要开始 v0.3。

完成后：

1. 更新架构文档；
2. 创建 `PHASE13_REPORT.md`；
3. 完整测试；
4. browser smoke；
5. anti-cheat audit；
6. commit；
7. push；
8. 创建 PR 到 `main`；
9. 停止等待最终 v0.2 评审。
