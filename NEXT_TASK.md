# NEXT TASK — Arena v0.1.1：视觉模型完善

Arena v0.1 的物理对抗闭环已经成立。下一步先不要继续底层 Phase，也不要修复杂 AI。

本任务只解决一个问题：

> 当前 Fighter 只是方块、球和裸露关节，视觉上过于粗糙。把 Rammer 和 Gripper 做成两个完整、统一、有辨识度的机械兽模型，同时保持现有物理结构、质量、Collider、Actuator、Damage 因果链不变。

---

## 1. 最重要的边界

这是 **Rendering / Presentation Pass**，不是 Physics 重构。

默认禁止修改：

- Part mass；
- Part collider geometry；
- Connection 类型、anchor、axis、limits；
- Actuator maxOutput；
- Energy；
- Material Damage 参数；
- ArenaOpponent 行为逻辑；
- Damage / fracture 规则。

除非发现纯粹的渲染 bug，否则不要借“美化模型”顺手调物理。

验收时 Arena v0.1 原有物理测试必须继续通过。

---

## 2. 视觉目标

两个 Fighter 必须一眼能区分，并且看起来像“完整机械体”，而不是调试积木。

### Rammer

视觉语言：

- 低矮、厚重、前冲；
- 明确的车体/躯干外壳；
- 前部撞角/撞槌结构要和现有真实 rammer-nose 位置一致；
- 轮子有轮毂、胎面/层次；
- chassis 与 nose 之间有可读的机械连接；
- 可以增加非物理的装甲壳、支架、灯/传感器等装饰；
- 色彩统一，强调“重型冲撞单位”。

不要把视觉撞角画得远大于真实 collider，避免玩家误判碰撞范围。

### Gripper

视觉语言：

- 更灵活、更像捕捉/夹持机械兽；
- chassis 有完整外壳；
- 两侧 jaw 必须清晰可见并与真实 prismatic jaw 位置一致；
- jaw 的开合方向一眼能理解；
- 可以增加钳口壳体、滑轨护罩、非碰撞机械细节；
- 轮子同样补完整视觉结构；
- 色彩与 Rammer 明显区分。

不要添加视觉“牙齿”并让玩家误以为它们具有真实碰撞，如果只是装饰，必须尺寸克制并位于真实 jaw collider 范围内。

---

## 3. 实现方式

优先扩展 ThreeSmokeRenderer，使：

> 一个 Physics Part handle 可以对应一个“视觉组合体”，而不是只能对应单个 primitive mesh。

推荐建立 rendering-only 的 visual descriptor，例如：

```ts
PartVisual
VisualPiece
VisualAssembly
```

每个 VisualPiece 可以包含：

- box / sphere / cylinder / capsule / cone；
- local position；
- local rotation；
- local scale；
- material/color；
- optional emissive。

这些数据只属于 Rendering / Arena presentation。

不要把这些外观字段塞进 Core Material、Damage 或 Physics Blueprint。

---

## 4. 视觉组合必须跟随真实 Part

如果一个 Part：

- 移动；
- 旋转；
- fracture 后脱离；
- Connection 分离；

它对应的整套视觉组合必须一起跟随该 Part 的真实 Pose。

不得出现：

- 外壳留在原地；
- jaw collider 已断但视觉仍连在 chassis；
- detached Part 的装饰继续跟随旧父体。

一个视觉 assembly 的根 Pose 必须来自该 Part 的真实 Rapier Pose。

---

## 5. 可以增加的纯视觉元素

允许：

- 机械外壳；
- 倒角/分层结构；
- 轮毂；
- 轴帽；
- 装甲板；
- 管线；
- 小型灯光/发光件；
- 传感器/“眼睛”；
- 非碰撞支架；
- 颜色与材质层次；
- 地面网格、Arena 标记；
- 更好的环境光与阴影；
- 简单受损颜色反馈。

这些都不能影响 Physics。

---

## 6. Damage 可视化

当前 Damage 已经是真实状态，所以可以把它更直观地表现出来。

建议：

- intact：正常材质；
- yielded / damaged：轻微发热/橙色或表面高亮；
- fractured：明显变暗/红色警示；
- separated：视觉上随真实 Part 分离。

禁止伪造：

- 血条；
- HP 数字；
- 不存在的裂纹 Collider；
- 视觉爆炸触发额外 Damage。

---

## 7. Arena 本身也顺手做最小视觉整理

可以做：

- 地面边界更清晰；
- 两侧出生区标记；
- Arena 中央线；
- 更合适的固定摄像机；
- 灯光、阴影、背景；
- Fighter 名称/颜色标识。

不要做大型 UI 重构。

---

## 8. 不做

本任务不要做：

- GLTF 资产管线大改；
- 外部商业模型；
- 动物皮肤/毛发；
- 骨骼动画；
- soft body；
- 真实轮胎形变；
- 粒子特效大系统；
- Camera shake；
- post-processing 大改；
- Phase 15；
- Spring/Damper；
- Brain/evolution；
- 物理平衡调整。

先把现有两个 Fighter 从“调试积木”提升到“像一个完整东西”。

---

## 9. 验收标准

必须满足：

1. Rammer 一眼能看出是低矮重型冲撞机械体；
2. Gripper 一眼能看出是带双 jaw 的夹持机械体；
3. 不看调试线也能理解主要结构；
4. 轮子、jaw、nose 与真实 Physics Part 大致对齐；
5. Damage / separation 在视觉上可读；
6. detached Part 的全部视觉组件正确跟随真实 Part；
7. 不修改 Arena v0.1 的核心 Physics 参数；
8. 原 Arena 物理测试继续通过；
9. `npm test`、`npm run typecheck`、`npm run build`、`npm run check:boundaries` 全通过；
10. 浏览器实际试玩确认模型不再只是方块/球调试件。

---

## 10. 工作方式

直接在当前 `codex/arena-v0.1` 基础上完成。

主代理负责设计和实现，不要让用户中途传话。

完成后：

1. 创建 `ARENA_VISUAL_V011_REPORT.md`，只记录视觉结构、rendering 架构和物理零改动证明；
2. 跑完整测试；
3. browser smoke；
4. commit；
5. push；
6. 停止等待审查。

# 最终验收

**Rammer 和 Gripper 必须从“物理调试积木”提升为有完整轮廓、机械层次和明确功能辨识度的两个机械兽，同时所有运动、碰撞、损伤和失能仍完全由 Arena v0.1 原有真实物理结构决定。**
