# NEXT TASK — Animal Arena v0.4：牵引与四足步态闭环

当前 `codex/animal-arena-v0.3` 最新提交已经完成：

- 通用 spherical angular limits；
- hard-ish limit 与 passive compliance 分离；
- Leopard 肩/髋/脊柱配置可信活动范围；
- 600 tick 长时站立；
- 前进、左右转向；
- 两种受撞恢复；
- 双豹前肢/头/颌真实接触；
- 无 torso 直接推进、隐藏扶正、teleport、直接伤害或读取对手精确坐标。

但 v0.3 **尚未完整通过**。

唯一明确失败项是：

> 前进时支撑期足底滑移过大。当前支撑接触点平面位移代理约为胸腔位移的 2.513 倍，因此还不能证明 Leopard 的前进主要来自可信的步态牵引，而不是脚在地面上持续打滑。

下一阶段只解决这个问题。

---

## 1. 核心目标

建立一个可测量、可解释的四足 locomotion traction 闭环：

```
Brain 选择 approach / turn
→ Motor 生成 stance / swing 协调
→ Joint Actuator
→ paw 与地面真实接触
→ friction / normal force
→ torso 位移
```

目标不是让豹子跑得快，而是：

> 身体前进主要来自足部周期性支撑和摆动，而不是四只脚在地面上持续滑行。

---

## 2. 先建立可信的牵引测量

不要一上来继续调 friction 或 actuator。

先把 locomotion 测量做清楚。

至少记录每只 paw：

- 是否接触地面；
- 接触持续时间；
- stance / swing 状态；
- 接触期间 paw 世界速度；
- 接触期间 paw 相对地面切向速度；
- 接触期间 torso 水平速度；
- normal / tangential contact proxy（现有接口能拿多少就用多少）；
- 每一步的落地点和离地点；
- stride length；
- duty factor；
- slip distance。

定义一个通用、可重复的 traction 指标，例如：

```
stance slip ratio
= stance 时 paw 相对地面滑移距离
  / 同窗口 torso 前进距离
```

也可以设计更合理的指标，但必须解释清楚。

不要只看“最后走了多远”。

---

## 3. 区分 stance 与 swing

当前 gait 主要是相位正弦目标。

下一步允许在 `LeopardMotorRuntime` 内建立更明确的 body-owned locomotion synergy：

- stance；
- lift-off；
- swing；
- touchdown。

状态切换必须主要依据：

- gait phase；
- paw contact sensor；
- proprioception；
- joint state。

禁止依据：

- 对手精确坐标；
- torso 世界速度目标直接反推外力；
- 时间脚本指定“第几秒抬哪条腿”。

周期相位可以存在，但实际接触反馈必须能改变腿的状态。

---

## 4. stance 阶段

支撑腿目标：

- 保持 paw 相对地面更稳定；
- 通过肩/髋、膝、踝关节变化推动身体经过支撑点；
- 不允许直接锁定 paw 世界位置；
- 不允许给 torso 推力。

允许：

- 根据 proprioception 调整 joint target；
- 根据 paw contact 调整支撑刚度/目标角；
- 合理利用 passive compliance；
- 通用摩擦参数。

---

## 5. swing 阶段

摆动腿应：

- 明确抬离地面；
- 向前摆；
- 再次落地；
- 避免全程擦地。

必须通过真实关节控制做到。

不要：

- setTranslation paw；
- collision disable 作弊穿地；
- teleport foot；
- kinematic foot placement。

---

## 6. 不要用“无限摩擦”解决

可以测试不同 friction，但不能把问题简化成：

```
friction = 100
```

然后宣布成功。

至少做：

- 当前 friction；
- 较低 friction；
- 较高但合理 friction；

三组对照。

如果 gait 只有在极高摩擦下才能前进，说明 locomotion 仍有问题。

---

## 7. 四足协调

第一版继续使用对角步态即可，不要求真实豹的完整步态库。

但必须看到：

- 不同 paw 有清晰的 stance / swing 切换；
- 不应该四足同时长期滑动；
- 至少一对对角腿能形成可解释的推进周期；
- 转向时左右侧 stance/stride 存在真实差异。

允许动作慢、笨。

---

## 8. 转向也要验证牵引

左转、右转不能只看 heading。

同时记录：

- 左右 paw stance time；
- 左右 paw slip；
- shoulder / hip yaw/roll；
- torso heading。

证明：

> 转向来自左右支撑与关节姿态差异，而不是身体在地面上横着滑。

---

## 9. 受撞恢复保留回归

v0.3 已经有两种受撞恢复。

本阶段不要重点调恢复，但必须保证 gait 改动后：

- 长时站立仍稳定；
- 两种受撞恢复不明显退化；
- spherical limit 不被突破到异常范围。

---

## 10. 双豹 Arena 回归

不要加新的攻击策略。

只确认 gait 改善没有破坏：

- 两个独立 Brain；
- 自主接近；
- 前肢接触；
- head/jaw 接触；
- Energy；
- Damage；
- Observer。

双豹接近速度可以变慢，但路径必须更可信。

---

## 11. Anti-cheat

重点扫描：

- torso direct force / impulse；
- torso direct torque；
- foot world-position lock；
- kinematic paw；
- teleport；
- setLinvel / setAngvel 正常 locomotion；
- friction 极端值；
- fixture-specific physics branch；
- scripted combat movement。

出现这些则失败。

---

## 12. 验收实验

### A — Traction metric baseline

记录 v0.3 当前 gait 的四足 slip / stance / stride 数据。

### B — 改进后直线前进

至少 600 tick。

要求：

- 明显净前进；
- 四个 paw 都出现多次 stance/swing；
- stance slip ratio 显著低于 baseline；
- 不允许靠极端摩擦；
- torso 姿态保持可用。

### C — 低摩擦对照

降低合理范围内 floor/paw friction。

预期：

- traction 变差；
- slip 增加；
- locomotion 下降。

这证明摩擦真的参与因果链，而不是 controller 在“假走”。

### D — 左右转向

记录左右腿 stance/slip/stride 差异。

要求：

- heading 向正确方向变化；
- 至少部分转向能由不对称 foot-ground interaction 解释。

### E — 长时稳定回归

600 tick 站立和两种撞击恢复继续通过。

### F — 双豹自主接近

保持独立 Brain。

记录：

- 最小距离；
- 接触 tick；
- gait slip 指标；
- 前肢/头颌接触。

---

## 13. 报告

创建：

```
ANIMAL_ARENA_V04_TRACTION_REPORT.md
```

必须回答：

1. traction/slip 指标如何定义；
2. v0.3 baseline 是多少；
3. 新 gait 如何区分 stance / swing；
4. paw contact 如何参与 motor control；
5. 改进后的直线前进数据；
6. 低摩擦对照；
7. 左右转向时左右脚的差异；
8. 是否仍有滑行主导现象；
9. 是否出现任何 locomotion shortcut；
10. 下一步最大的一个真实阻塞是什么。

---

## 14. 不做

本阶段不做：

- Contact Concentration；
- teeth / claw damage；
- HP；
- attackPower；
- 神经网络；
- 强化学习；
- 新战斗状态机；
- soft body；
- UI 大改；
- 高精模型。

先把“走路”做可信。

---

## 15. 工作方式

从：

```
codex/animal-arena-v0.3
```

继续开发。

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

**Leopard 的前进和转向必须主要来自可测量的 stance/swing 四足步态与真实足地牵引，支撑期 paw 滑移显著下降，并且没有通过 torso 推进、足部世界锁定、极端摩擦或其他隐藏捷径制造移动结果。**
