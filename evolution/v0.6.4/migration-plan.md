# Team Abstraction Migration Plan (v0.6.4)

> 本计划只作设计，**不执行**。迁移各步骤需用户确认后才逐步执行。

## 现状（Baseline，禁止改动）
- Router rules 硬编码 java/research/creative/engops（R1-R6）
- Capability registry `agent-capabilities.yaml` 30 agent + team 字段
- Team context：`.ai/context/teams/*/` 固定目录
- Quality Rules 分散在 Lead prompt

## 迁移目标
- 将以上全部收敛到 Generic Team Model：
  - `team-registry.yaml` 为唯一权威
  - Router fallback 按 capability 匹配 team
  - Capability registry 的 team 字段变为 view（读 registry）
  - Quality Rules 结构化到 registry

## 分阶段迁移
| 阶段 | 内容 | 执行时机 |
|------|------|----------|
| 1. 抽象层 | 建立 team-registry.yaml（已建） | 已完成 |
| 2a. 兼容层 | Router fallback 逻辑（只读，不执行） | 待用户确认 |
| 2b. 兼容层 | Capability registry 增加 `team_ref` 指向 registry | 待确认 |
| 3. Knowledge 迁移 | team-context 目录 → registry 字段（保留原文件只读） | 待确认 |
| 4. 新 Team 添加 | data/legal/finance/custom 直接 registry 添加，Router fallback 自动可用 | 待确认 |
| 5. 完整迁移 | 删除/归档旧硬编码（R1-R6 保留为 legacy rules） | 不执行 |

## 兼容性清单
- [ ] Router 未命中 R1-R6 → 走 generic fallback
- [ ] capability 查询不受影响（30 agent 不变）
- [ ] team-context 文件保持只读
- [ ] 基线（Agent=30）不变化
- [ ] 旧 workflow 可继续执行

## 风险与回滚
- 迁移中若 Router 误路由：回滚 team-registry 到 v1 前状态（备份 + rollback）
- 新增 team 未添加到 registry：Router fallback 找不到 → 报"未注册 team"并转 PM 人工
- 所有迁移前备份到 `rollback/backups/`

## 决策记录
- 不做硬切换：兼容层长期保留，直至所有团队迁移完成
- 不自动删除旧 R1-R6：作为 legacy rules 保留（与新 registry 对照）