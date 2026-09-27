# NEXT TASK — Animal Arena v0.4 收口：持续支撑牵引必须真正过关

当前 `codex/animal-arena-v0.4` 已经取得真实进展：

- 新增了明确的 `hold / stance / swing / seek` 四足步态状态；
- Paw Contact 已参与 lift-off、touchdown、stance/seek 切换；
- 四只 Paw 均能周期性离地并重新接触；
- v0.3 baseline 与 v0.4 新 gait 已用同一套牵引仪器重新测量；
- 低摩擦时位移下降、滑移上升，证明足地摩擦确实进入因果链；
- 没看到 torso 直接推进、足部世界锁定、teleport、kinematic paw 等作弊。

但是 v0.4 **尚未达到最终验收**，不要进入牙齿、爪、Contact Concentration、复杂战斗 AI 或新阶段。

当前最关键的问题：

```
v0.3 baseline:
Stance Slip Ratio            = 1.208
Sustained Stance Slip Ratio  = 0.936

v0.4 traction gait:
Stance Slip Ratio            = 1.006
Sustained Stance Slip Ratio  = 0.980
```

整体滑移下降了约 16.7%，这是进步。

但：

> 持续支撑期的滑移没有下降，反而从 0.936 上升到 0.980。

所以报告中“已经不存在滑行主导”这一结论目前证据不足。

本任务只做 v0.4 收口，不扩功能。

---

## 1. 先修正报告结论

更新 `ANIMAL_ARENA_V04_TRACTION_REPORT.md`：

不能再写：

> 是否仍有滑行主导：否

应该如实写成：

> 步态结构已从连续拖曳改为明确 stance/swing，整体 slip ratio 有下降，但持续支撑期滑移仍接近 torso travel，同样量级，尚未证明稳定支撑阶段已经摆脱滑移主导。

不要为了“通过”修改措辞掩盖数据。

---

## 2. 目标不是继续增加摩擦

当前：

- floor friction = 1.4
- paw friction = 1.6

可以保留作为正常组。

禁止通过继续把 friction 提到极高值来通过。

重点应放在：

- touchdown 时 paw 切向速度；
- stance 初期冲击；
- stance hip sweep 速度；
- knee / ankle 支撑协调；
- paw 接触几何；
- gait phase 与真实 contact 的同步；
- 高频接触抖动。

---

## 3. 找出持续支撑滑移来源

给每条腿记录至少：

- touchdown 前 3 tick paw horizontal velocity；
- touchdown 后 3 / 6 / 12 tick paw horizontal velocity；
- stance 中段 paw horizontal velocity；
- stance 末段 paw horizontal velocity；
- torso horizontal velocity；
- hip pitch velocity；
- knee velocity；
- ankle velocity；
- contact impulse / force proxy；
- stance duration；
- material-point slip。

按 episode 分解：

```
touchdown transient slip
early stance slip
mid stance slip
late stance slip
```

先确认滑移主要发生在哪一段，再改 controller。

不要继续凭感觉调参数。

---

## 4. 重点改 touchdown 与 stance

优先调查：

### touchdown

目标：

- Paw 接地瞬间切向速度尽量接近地面；
- 不要以前冲速度撞地后再靠摩擦刹停。

允许：

- 使用自身 local velocity；
- 使用关节 proprioception；
- swing 末段 pullback；
- ankle 姿态调整。

禁止：

- 读世界坐标锁 foot；
- 直接设置 paw velocity。

### stance

目标：

- Paw 一旦进入稳定支撑，材料接触点应尽量保持在地面附近；
- Torso 应通过关节运动相对支撑点向前通过。

可以调整：

- speedMatchedRate；
- stance hip servo；
- knee arc compensation；
- ankle flattening；
- stance stiffness / damping；
- gait duty factor。

但要一次只改少数参数，并保留对照数据。

---

## 5. Traction 指标再补一项

当前 ratio：

```
paw slip distance / torso travel
```

保留。

再增加一个直观指标：

```
stance anchoring efficiency
= max(0, 1 - pawSlip / torsoTravel)
```

按：

- 每个 stance episode；
- 每只 paw；
- 全局加权；

分别统计。

同时报告：

- median；
- p75；
- p90；

避免少量异常 episode 把均值带偏。

---

## 6. 明确收口门槛

不要用“有改善”作为通过标准。

在相同正常摩擦条件和同一 600 tick 直线任务下，至少满足：

### 必须满足

- forward displacement > 0.8 m；
- 四只 Paw 都有 >= 3 次有效 swing；
- 每只 Paw swing clearance > 0.05 m；
- stanceSlipRatio <= 0.80；
- sustainedStanceSlipRatio <= 0.80；
- 相比 phase-sine baseline 至少下降 20%；
- min upright > 0.90；
- spherical joint 不越出可信范围。

### 最好达到

- sustainedStanceSlipRatio <= 0.65。

如果做不到，不要硬宣布通过；报告真实瓶颈。

---

## 7. 低摩擦因果对照继续保留

至少：

- low = 0.35；
- normal = 1.4；
- high = 2.4。

要求：

```
low friction:
  slip 更高
  traction 更差
  displacement 不优于 normal
```

但高摩擦不需要最快。

不要为了得到单调曲线去作弊。

---

## 8. 修正双豹接触测试写法

当前 v0.4 的 F 测试把两只 Entity 的相同 Part ID 合并后，再根据 `partId.includes('jaw')` 决定读取哪只豹子，逻辑不够干净。

改为明确遍历：

```
for each entityId in [leopard-a, leopard-b]
  for each owned partId
    readPartContacts(entityId, partId)
```

然后分别统计：

- A touching B；
- B touching A；
- front limb；
- head；
- jaw。

避免测试本身的实体归属含糊。

---

## 9. 测试不要依赖可变全局 baseline 顺序

当前：

```
baseline.slipRatio
```

由测试 A 写入，再由测试 B 使用。

改成：

- `beforeAll` 生成 baseline；
- 或在 B 中显式生成 baseline；
- 或公共 helper 返回 baseline。

不要让验收依赖测试执行顺序。

---

## 10. 回归必须继续通过

不能为了降低滑移破坏：

- 600 tick 长时站立；
- 左转；
- 右转；
- 两种冲击恢复；
- 双豹自主接近；
- front limb contact；
- head/jaw contact；
- Energy；
- Damage；
- spherical limits。

---

## 11. Anti-cheat

继续检查：

- direct torso force / impulse / torque；
- paw world-position lock；
- kinematic paw；
- setTranslation / setRotation locomotion；
- setLinvel / setAngvel locomotion；
- teleport；
- extreme friction；
- direct opponent pose；
- fixture-specific physics branch。

任何一项进入正常 gait 路径即失败。

---

## 12. 报告

仍然更新：

```
ANIMAL_ARENA_V04_TRACTION_REPORT.md
```

不要另开 v0.5 报告。

最终必须清楚写：

1. 原 v0.4 为什么还没通过；
2. 滑移主要发生在 touchdown / early / mid / late stance 的哪部分；
3. 修改了哪些 gait 参数/机制；
4. baseline；
5. 新 stanceSlipRatio；
6. 新 sustainedStanceSlipRatio；
7. anchoring efficiency 分布；
8. 低/正常/高摩擦对照；
9. 是否真正达到收口门槛；
10. 如果仍未达到，真实原因是什么。

---

# 最终验收

**只有当正常摩擦下 Leopard 的持续支撑滑移明显低于躯干推进距离，并且 stance/swing、站立、转向、受撞恢复和双豹接触都继续成立时，Animal Arena v0.4 才算真正完成。**

不要进入下一阶段，直到这个门槛真的通过。
