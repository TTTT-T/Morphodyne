# NEXT TASK — Arena v0.1：先把 Morphodyne 变成可玩的斗兽场

当前 Phase 15（Contact Concentration）暂停，不删除其方向；只有当 Arena 实际暴露“尖/钝接触无法区分”为阻塞问题时再回来做。

本阶段目标不是继续扩底层理论，而是用现有 Morphodyne 规则做出第一个真正可玩的闭环：

> 两个由通用 Part / Connection / Actuator / Energy / Damage 规则构成的实体，在同一个 3D 场地中移动、接触、对抗，并因为真实物理过程出现结构损伤或失能。

Arena v0.1 本身就是下一轮架构压力测试。

---

## 1. 核心原则

必须保持：

```text
Structure
→ Actuator physical output
→ Rapier
→ Contact / structural load
→ Damage / separation
→ observable capability loss
```

禁止变成：

```text
attack button
→ attackPower
→ HP -= damage
```

Arena 只能组织场景、输入、观察与重置，不能替实体制造能力或结果。

---

## 2. 第一版范围必须小

不要直接做狮子、老虎或完整动物。

先做两个低复杂度 Fighter fixture，目的只是验证对抗闭环。

### Fighter A — Rammer

一个低重心、结构稳定、可向前运动的实体，前部有真实几何撞击结构。

“攻击”只能来自：

```text
actuation
→ body acceleration
→ physical collision
→ existing Part Damage
```

不得存在 ramDamage / attackStrength。

### Fighter B — Gripper

一个低重心实体，带可主动闭合的夹持/颚式结构。

“咬/夹”只能来自：

```text
ControlSignal
→ joint/tension actuator
→ jaws physically close
→ real contact/friction/load
→ existing Damage
```

不得存在 biteDamage / gripDamage。

这两个 fixture 只是验证工具，不建立 Rammer/Gripper 专用 Core 类型。

---

## 3. Arena 场景

新增一个独立 Arena 场景/模式，至少包含：

- 平整地面；
- 简单围墙或边界；
- 两个独立 Entity 同时存在；
- 清晰的出生位置；
- 摄像机能同时观察双方；
- Reset / Restart；
- Pause；
- 基本时间显示。

Arena 不应侵入 Core Physics 规则。

---

## 4. 控制

Arena v0.1：

- Fighter A：玩家控制；
- Fighter B：简单自动控制。

玩家输入继续走：

```text
UI/Input
→ ControlSignal
→ Actuator
```

不得从 UI：

- setTranslation；
- setRotation；
- 直接改 velocity；
- 直接 applyImpulse 到 torso 作为移动能力；
- 直接设置 DamageState。

---

## 5. 简单对手控制器

不要解冻复杂 Brain/Skill。

对手只需要：

```text
观察对方大致方向
→ 转向/靠近
→ 在合适条件下输出已有 actuator ControlSignal
```

可以非常笨。

它的目标是让双方发生真实互动，不是证明 AI。

禁止：

```text
enemyNear → applyDamage()
enemyNear → executeBiteSuccess()
```

是否撞到、夹到、造成损伤，全部交给物理世界。

---

## 6. 明确禁止“假运动”

参考项目研究已经发现，很多 active-ragdoll 项目为了好看会直接给 torso：

- hover impulse；
- upright torque；
- forward drive impulse；
- yaw torque；
- teleport rescue。

这些在普通游戏里可以接受，但 Arena v0.1 的正常移动链路中禁止使用它们。

特别禁止为了“能走”添加：

```text
applyDrive()
applyHover()
applyUpright()
bodyForwardImpulse
hidden reaction wheel
extra fixture-only actuator signal
```

允许：

- Joint actuator；
- Tension actuator；
- 合法的 physical contact；
- friction；
- normal constraints；
- 现有 Energy 限制。

如果实体因此走得很差，就记录真实失败，不要用隐藏力掩盖。

---

## 7. 战斗/伤害禁止语义化

生产 Core / Physics / Simulation 中禁止新增：

- health / hp；
- attackPower；
- biteDamage；
- ramDamage；
- weaponDamage；
- armor；
- defense；
- damageMultiplier；
- isWeapon；
- canAttack；
- canBite；
- canFight。

现有 Damage 系统继续作为唯一结构损伤来源。

Arena 可以显示：

- Part integrity；
- Connection state；
- Energy；
- structural component count；
- 是否仍能产生明显运动；

但不能增加一条独立“生命值”。

---

## 8. ArenaObserver

增加一个只读的 `ArenaObserver` 或等价模块。

职责只包括：

- 观察双方结构状态；
- 观察 Energy；
- 观察位置；
- 观察是否还有可用 actuator / 可测运动；
- 判断本局是否需要结束；
- 输出结束原因。

第一版结束条件可以很简单，例如：

- 主体完全失去主要结构连接；
- 长时间无法产生有效运动；
- 越界；
- 手动结束；
- 超时。

不要定义“HP <= 0”。

Observer 不能修改物理结果。

---

## 9. 暂时不要顺手解决这些问题

除非 Arena 被它们直接阻塞，否则本阶段不要展开：

- Contact Concentration / Phase 15；
- Material V2；
- joint reaction WASM fork；
- 完整 Energy topology；
- soft body；
- Spring/Damper 大系统；
- 完整 animal body；
- 复杂 Brain；
- evolution；
- penetration / cutting；
- mesh fracture；
- UI 大重做；
- ECS 重构。

原则：

> 先让 Arena 暴露哪个问题真正阻塞，再只修那个问题。

---

## 10. 允许的最小阻塞修复

如果两个简单 Fighter 无法完成 Arena 闭环，允许只做最小必要修复。

例如：

### A. 身体完全无法稳定移动

先检查：

- geometry；
- COM；
- friction；
- actuator strength；
- joint axis / limits；
- control phase。

只有明确证明这些仍不足时，才讨论最小 passive spring/damper。

### B. 接触完全无法产生有意义的损伤差异

先使用现有 Damage。

如果确认“接触面积/集中程度”已经成为 Arena 的真实阻塞，再恢复旧 Phase 15。

### C. 多关节 Connection Damage 明显错误

记录 estimator 失真案例，再单独处理。

不要提前重写全部 estimator。

---

## 11. 参考项目的使用边界

可参考：

### nickmeinhold/virtual-creatures

参考：

- graph-based morphology；
- attachment；
- multi-DOF joints；
- genotype/blueprint → physical body。

不要照搬其 evolution/brain。

### chrxh/alien

参考：

- “世界先可玩”的产品形态；
- 实时 inspection；
- 编辑/观察体验；
- 局部结构与资源的长期方向。

禁止照搬其 Attacker/Defender 属性战斗系统。

### Feelsrat/creature-playground

参考：

- Three.js + Rapier creature construction；
- collision groups；
- joints；
- ragdoll/debug tooling。

禁止照搬：

- hover；
- upright assist；
- torso drive；
- hidden yaw torque；
- teleport-based normal locomotion。

### EvoGym

参考 Body 与 Arena/Task 解耦。

---

## 12. 最低可玩验收

Arena v0.1 必须实际做到：

1. 页面/模式中能进入 Arena；
2. 同一个 World 中同时存在两个真实 Entity；
3. 玩家能通过 ControlSignal 控制 Fighter A；
4. Fighter B 能通过简单控制器靠近玩家；
5. 两个实体能真实碰撞；
6. 至少一种对抗动作能通过现有物理链产生可观察 Damage；
7. Damage 后结构/运动表现出现自然下降；
8. ArenaObserver 能报告一局结束及原因；
9. Reset 后世界状态干净；
10. 不依赖 HP、attackPower、隐藏 torso 推进/扶正力。

不要求：

- 好看；
- 像真正动物；
- 平衡；
- 战斗有趣；
- AI 聪明；
- 每局都能分出胜负。

第一版的成功标准只有：

> “Morphodyne 的现有规则已经能支撑一个真实的双实体物理对抗闭环。”

---

## 13. Anti-cheat 审查

完成后专门扫描：

- torso direct impulse/torque locomotion；
- fixture id 特判；
- Fighter A/B 特判；
- semantic attack/damage；
- UI direct physics mutation；
- hidden reaction wheel；
- 测试专用额外 actuator 注入；
- 直接设置成功/失败状态。

任何上述路径进入生产 Arena，则本阶段不通过。

---

## 14. 测试

至少增加：

- 双 Entity 同 World coexistence；
- Arena reset；
- player ControlSignal path；
- opponent ControlSignal path；
- real contact between fighters；
- contact → existing Damage；
- damage → observable structural/functional degradation；
- ArenaObserver read-only behavior；
- anti-cheat regression。

继续运行：

```bash
npm test
npm run typecheck
npm run build
npm run check:boundaries
```

---

## 15. 报告

创建：

```text
ARENA_V01_REPORT.md
```

只回答：

1. 两个 Fighter 的实际结构；
2. 它们如何移动；
3. 它们如何发生对抗；
4. Damage 的真实因果链；
5. 是否发现隐藏辅助力；
6. Arena 暴露出的前三个真实底层瓶颈；
7. 下一步只推荐解决哪一个。

不要把报告写成长期路线图。

---

## 16. 工作方式

这是一个完整任务，不要要求用户中途传话。

主代理负责：

- 设计；
- 实现；
- 测试；
- anti-cheat review；
- 报告。

可以使用 `gpt6-luna` 子代理做独立代码审查或参考项目核对。

不要建立 verifier 子代理。

完成后：

1. 更新必要文档；
2. 创建 `ARENA_V01_REPORT.md`；
3. 跑完整测试；
4. commit；
5. push；
6. 停止，等待独立评审。

---

# Arena v0.1 最终验收

**两个没有 HP、attackPower 或隐藏推进/扶正力的 Morphodyne Entity，能够在同一个 3D Arena 中依靠自身结构、Actuator 和真实物理接触发生对抗，并产生真实可观察的结构损伤与功能下降。**

如果为了“能玩”而直接制造移动、攻击成功、伤害或胜负结果，则 Arena v0.1 不通过。
