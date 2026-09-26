# NEXT TASK — Animal Arena v0.3：关节限位 + 真正“会用身体”的对抗

当前 `codex/animal-arena-v0.2` 最新实现已经通过本轮方向审查：

- Leopard 肩/髋与躯干已有通用 spherical Connection；
- 多轴 Actuator / proprioception 已接通；
- passive angular compliance 为通用 Connection 机制；
- 单豹站立、前进、左右转向、受撞恢复已有真实物理实验；
- 双豹能自主接近，并出现头部、前肢、下颌真实接触；
- 没有发现 torso 扶正、直接推进、teleport、直接伤害或读取对手精确坐标等作弊路径。

下一阶段不要扩复杂 Brain，也不要做牙齿/爪伤害系统。

本阶段只解决两个相互关联的问题：

> 1. 给通用 spherical Connection 增加真实可约束的角度活动范围；  
> 2. 利用这套更可信的身体约束，让 Leopard 真正更会“使用自己的身体”完成稳定移动、转身、前肢接触和头颌定位。

---

## 1. 通用 spherical angular limits

当前 spherical 有三轴自由度和 passiveAngular，但没有硬角度限位。

这会允许肩、髋、脊柱出现不合理的大角度旋转，污染后续动物行为。

新增 backend-neutral 的通用角度约束能力。

优先考虑：

- swing / twist limits；
- 或经过验证的 per-axis angular limits。

要求：

- 定义在 Core Connection 层；
- 不得是 Leopard 专用字段；
- 机械结构也能使用；
- Blueprint 校验完整；
- Sensor / Actuator 坐标定义保持一致；
- Rapier adapter 中不得靠 setRotation / velocity clamp 假装限位。

如果 Rapier 0.20 的 spherical runtime 无法直接提供公开 limit API，可以使用通用物理约束/恢复力矩实现，但必须明确区分：
- hard-ish limit；
- passive compliance；
不能把两者混成一个模糊弹簧。

---

## 2. Leopard 使用合理的活动范围

把 Leopard 的这些部位配置合理范围：

- 四个 shoulder / hip；
- spine；
- neck；
- jaw；
- 必要的 tail。

目标不是解剖精确，而是：

- 防止肩髋翻转；
- 防止腿穿过躯干式异常姿态；
- 限制脊柱和颈部进入明显不合理角度；
- jaw 保持可信开合范围。

所有参数必须只描述结构活动范围，不赋予能力。

---

## 3. 不改 Brain 来掩盖身体问题

保持：

```
Sensor
→ Brain
→ Motor intent
→ Actuator
→ Connection
→ Physics
```

Brain 继续只决定：

- stand / recover；
- approach；
- turn；
- interact。

不要新增复杂攻击状态机。

重点改进 Motor / body synergy：

- 四足支撑；
- 连续前进；
- 左右转向；
- 受撞后重新组织姿态；
- 前肢 reach / brace；
- head / neck orient；
- jaw close/open。

这些都必须通过现有/通用关节完成。

---

## 4. “会用身体”的最低表现

这一阶段不追求真实豹子动画。

但应该明显比 v0.2 更接近：

- 身体不会靠关节无限翻转来完成动作；
- 转向时肩髋真的侧向调整；
- 前肢能够改变接触位置，而不是只前后摆；
- 头颈可以调整咬合位置；
- 被撞偏后能重新形成可用支撑；
- 接触时身体姿态会根据当前感觉和物理反馈变化。

---

## 5. 真实实验

必须至少做以下可重复实验，并记录量化结果。

### A — 关节限位

对一个通用 spherical test body：

- 分别沿 swing / twist 或各轴施加持续力矩；
- 真实角度不得无限增长；
- 到达限制附近后仍保持数值稳定；
- 反向驱动可以离开限制。

### B — 长时站立

单 Leopard 至少运行 600 tick。

记录：

- chest 最低高度；
- torso upright；
- 四足接触占比；
- spherical joint 最大角度；
- 能量。

不得依赖身体级辅助力。

### C — 连续前进

存在匿名前方目标。

要求：

- Agent 通过自身感知决定 approach；
- 连续运行后产生显著位移；
- 不是滑行主导；
- 至少多个 paw 有周期性接触变化。

### D — 左右转向

左右目标分别测试。

要求：

- heading 明显向目标方向改变；
- shoulder / hip 的非单轴坐标确实参与变化；
- 不允许直接 yaw torque 到 torso。

### E — 被撞恢复

从不同侧向/斜向至少两种冲量测试。

要求：

- 身体姿态真实扰动；
- 后续通过四肢/脊柱/接触重新进入可用状态；
- 不要求每次完美恢复，但不能依赖隐藏复位。

### F — 双豹身体交互

无人控制运行。

至少证明：

- 两个独立 Brain；
- 自主接近；
- front limb 与对方产生真实接触；
- head/jaw 与对方产生真实接触；
- 接触过程中 shoulder/hip/head joint posture 有实际调整；
- 结果由 Physics 决定。

---

## 6. 不做

本阶段先不要做：

- HP；
- attackPower；
- biteDamage；
- clawDamage；
- Contact Concentration；
- 牙齿穿刺；
- 爪切割；
- 神经网络；
- 强化学习；
- 复杂战斗策略；
- 大型 UI 重做；
- soft body；
- 肌肉生物力学精确建模。

如果 jaw / claw 的伤害差异确实成为下一阶段阻塞，再恢复 Contact Concentration。

---

## 7. Anti-cheat

重点扫描：

- torso direct force / torque；
- setTranslation / setRotation 用于正常运动；
- setLinvel / setAngvel 用于恢复；
- hidden upright；
- teleport rescue；
- opponent exact pose；
- scripted combat timeline；
- direct damage；
- grapple weld；
- fixture-specific Physics branch。

正常 Arena 路径中出现即失败。

---

## 8. 报告

创建：

```
ANIMAL_ARENA_V03_BODY_USE_REPORT.md
```

只回答：

1. spherical limit 如何表达；
2. Rapier 如何实现；
3. hard limit 与 passive compliance 如何区分；
4. Leopard 各主要关节使用什么范围；
5. 长时站立结果；
6. 前进与左右转向结果；
7. 两种受撞恢复结果；
8. 双豹接触时前肢/头颌如何真实调整；
9. 是否发现隐藏辅助路径；
10. 下一步唯一最大的物理阻塞是什么。

---

## 9. 工作方式

继续基于：

```
codex/animal-arena-v0.2
```

这是一个完整任务，不要让用户中途传话。

完成后：

1. 全量测试；
2. `npm run typecheck`；
3. `npm run build`；
4. `npm run check:boundaries`；
5. browser smoke；
6. anti-cheat scan；
7. 创建报告；
8. commit；
9. push；
10. 停止等待独立审查。

# 最终验收

**Leopard 的肩、髋、脊柱等关节具有通用且可信的活动范围；它能够依靠自己的多自由度身体、感知和关节执行器完成更稳定的站立、前进、左右转向、受撞恢复以及近距离前肢/头颌姿态调整，而不是依靠无限关节旋转、身体级辅助力或更复杂的战斗脚本。**
