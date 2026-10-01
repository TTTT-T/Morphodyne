# NEXT TASK — Playable Lab v0.1

接受基线：PR #21 普通合并后的 main `92c3768`。专用分支：`codex/playable-lab-v0.1`。

目标：建造实验沙盒为主，Arena 为辅助。普通用户不读报告、不编辑 JSON，约一分钟开始首个实验，完成修改 → 运行 → 观察 → 保留设计重试 → 保存。

范围：默认夹持；清晰夹持/起重/结构损伤入口；区分用户设计重试与恢复原始模板；保存所有声明 Blueprint、出生位置、独立载荷关系、控制、初始能量及环境设置；命名本地作品及文件导入/导出；先验证后载入；真实结果与两次试验比较；场景显示损伤；Arena 往返保留设计并恢复新试验。

存档是版本化声明设计，不保存运行中的速度、损伤或时间。新试验通过 World removal / Construction spawn，不传送或补偿结果。不新增 Core/Physics/Brain 功能、战斗策略、爪伤害、步态调优、依赖或系统工具。保留用户 Untitled.md。

验收：三类实验循环；至少一项结构/材料变化有真实差异；重试、保存、刷新读取、文件往返保留独立载荷；Arena 往返保留设计；约十五分钟连续探索仍可操作；控制台无新增错误。

完成 focused checks、全量 test/typecheck/build/boundaries、Mac 浏览器逐项验收，写 PLAYABLE_LAB_V01_REPORT.md，commit/push/PR → main，附加 PR，停在独立验收边界，不合并新 PR。
