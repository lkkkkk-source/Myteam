# java-architect v2 — Analysis (v0.6.6)

agent: java-architect
from_version: v1
to_version: v2
phase: v0.6.6 / Agent Evolution Scale

## 审计结论（v0.6.3 benchmark 遗留差距）
- v1 依赖"经验直觉"完成架构分析，缺少**证据化输出结构**（模块图/依赖关系/影响面需逐项可定位）。
- v1 没有**职责边界自检**：read-only 约束只有一句"只读"，缺乏提交前清单对抗"顺手改配置/改测试"。
- v1 未区分「架构决策」与「探索性认知」：demo / 备选方案缺少 ADR 对齐与 trade-off 记录。

## 外部研究（external/agency-agents 只读参考，不复制）
- `engineering-backend-architect.md`：强调 scale 设计、数据库/API 架构、影响面与风险显性化。
- `engineering-software-architect.md` / `engineering-autonomous-optimization-architect.md`：结构驱动 + 优化权衡。
- `design-ux-architect.md`：认知边界（what/why）与输出结构。

## 提炼（转写为本平台协议，非复制）
1. **证据化输出**：架构文档每个结论带模块/文件/行 级引用 —— 对齐 java-developer v2 的 Evidence Output。
2. **Scope 自检（read-only 对抗）**：提交前强制盘点 touched files，任何 write/edit 操作须显式 justify。
3. **决策 vs 探索分离**：推荐方案与备选方案各自给 trade-off / 风险 / 决策理由。
4. **备选方案最小化**：不为不存在的大规模场景过度设计（借鉴 developer 的"不为不可能防御"）。

## 风险
- 纯加法，无删除；不改变 java-architect 的只读职责。
- 只影响架构文档产出质量，不影响其他 Agent。

## 决策
升级为 v2（additive）。
