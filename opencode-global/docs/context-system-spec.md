# Context File Specification

> 项目内当前任务状态层。`当前任务状态管理` 的唯一规范文件。

## 位置
`.ai/context/current-task.yaml`（全局配置目录不放，属于项目数据）

## 与 Knowledge / Memory 的边界
| 层 | 存什么 | 生命周期 |
|----|--------|----------|
| **Context**（本文件） | 当前进行中任务的状态、计划、指针、交接记录 | 任务结束即归档到 `.ai/context/archive/` |
| **Knowledge**（`.ai/knowledge/`） | 稳定项目事实（架构 / 约定 / 决策 / 坑） | 长期，跨任务 |
| **Memory**（MCP） | 跨会话元信息、用户偏好 | 长期 |

任务完成后：结论沉淀到 Knowledge（ADR / gotchas），Context 文件归档，不留"僵尸任务"。

## 文件结构（YAML）
```yaml
version: 1
task_id: "refund-feature"          # 短横线小写，创建时生成
title: "给订单系统增加退款功能"
status: planning | in-progress | paused | blocked | review | done | failed
created_at: "2026-09-20T11:20:00"
updated_at: "2026-09-20T11:25:00"

# —— 需求快照（PM 写入） ——
requirements:
  goal: "支持用户发起退款，状态流转 + 财务联动"
  scope_in: ["退款接口", "订单状态机扩展", "退款记录表"]
  scope_out: ["财务对账系统"]
  acceptance: ["退款接口返回新状态", "订单状态机含 REFUNDING/REFUNDED"]
  open_questions: ["退款是否需审批流？"]

# —— 分派（PM 写入） ——
assignment:
  department: "java"
  lead: "java-lead"
  workflow: "feature-development"
  parallel_tracks: []            # 并行任务 ID 列表（支持并行）

# —— 计划指针（Lead 写入，正文在 .ai/tasks/{task_id}/task-plan.yaml） ——
task_plan: ".ai/tasks/refund-feature/task-plan.yaml"

# —— Artifact 指针（各 Agent 产出后由 Lead 更新） ——
artifacts:
  architecture: ".ai/artifacts/architecture/{task_id}-architecture.md"
  code: ".ai/artifacts/code/{task_id}/"
  review: ".ai/artifacts/review/{task_id}-review.md"

# —— 交接日志（Agent 交接时追加，时间顺序） ——
handoff_log:
  - time: "2026-09-20T11:30:00"
    from: "java-lead"
    to: "java-architect"
    note: "架构分析启动，输入：requirements"
    status: "done"               # done / in-progress / blocked
  - time: "2026-09-20T11:45:00"
    from: "java-architect"
    to: "java-planner"
    note: "架构文档产出：architecture/refund-feature-architecture.md"
    status: "done"

# —— 恢复信息（暂停/继续） ——
resume_point:
  step: "step-3"                 # 对应 task-plan.yaml 的 step id
  instruction: "继续 step-3，输入 artifact 指针已就绪"

# —— 并行任务（可选） ——
parallel: []
```

## 规则
1. **写入方**：`current-task.yaml` 由 PM 创建；Lead 与执行 Agent 只追加 `handoff_log`、更新 `artifacts` / `resume_point`
2. **单一事实源**：任务状态只认本文件，口头/聊天里的"进度"不算数
3. **暂停**：置 `status: paused` + 填 `resume_point`（步骤 id + 一句话续做指引）
4. **继续**：读 `resume_point`，从该步骤恢复
5. **归档**：任务 `done` / `failed` 后整体移入 `.ai/context/archive/{task_id}.yaml`
6. **格式**：YAML 2.0，UTF-8（无 BOM），字段名小写下划线
