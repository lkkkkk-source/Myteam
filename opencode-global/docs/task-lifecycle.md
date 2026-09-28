# Task Lifecycle Specification (v0.3.4)

> Context 从"具备失败恢复能力"升级为"完整任务运行平台"。
> 定义任务五阶段状态机，明确每阶段的职责方与产物。
> **不实现 Scheduler**（自动调度属 v0.4 Runtime Layer），本阶段是**声明式状态机 + 规则**。

## 1. 任务五阶段状态机

```
RECEIVED → PLANNING → EXECUTING → FAILED/RECOVERING → COMPLETE → ARCHIVED
   │           │          │            │                  │
   ▼           ▼          ▼            ▼                  ▼
 PM 接收    Lead 规划  Lead 执行   Lead 恢复          PM 归档
 (current- (task-plan  (execution- (recovery-state    (current-task
  task)      +phase)     state)      +checkpoint)       status=archived)
```

| 阶段 | 状态值 | 负责方 | 读 | 写 | 出口产物 |
|------|--------|--------|---|----|----|
| 接收 | `received` | PM | 用户需求 | current-task.yaml | 任务登记 |
| 规划 | `planning` | Lead | current-task + knowledge | task-plan.yaml + knowledge-summary | 计划 + 知识摘要 |
| 执行 | `executing` | Lead + 子 Agent | task-plan + execution-state | execution-state / agent-status / handoff / artifact | 各 step 产物 |
| 失败/恢复 | `failed` / `recovering` | Lead + Recovery Agent | errors + recovery-state + checkpoint | recovery-state / checkpoint | 恢复记录 |
| 完成 | `complete` | Lead → PM | execution-state | handoff_log | 验收 |
| 归档 | `archived` | PM | 全部产物 | current-task.yaml status + 归档指针 | 归档快照 |

**状态流转规则**：
- `received → planning`：PM 创建 current-task.yaml 并分派 Lead
- `planning → executing`：task-plan.yaml 就绪 + knowledge-summary 生成
- `executing → failed`：子 Agent 写 errors/ + execution-state 置 failed
- `failed → recovering`：Lead 读 strategy-registry，写 recovery-state
- `recovering → executing`：恢复成功，step 回到 running
- `executing → complete`：所有 step completed + 验收通过
- `complete → archived`：PM 归档（任务完成 / 关闭）

## 2. 状态机载体（task-phase.yaml）

位置 `.ai/context/runtime/task-phase.yaml`，由 **PM / Lead 在阶段切换时更新**。

```yaml
version: 1
task_id: "refund-feature"
team: "java"
updated_at: "2026-09-20T12:50:00"

# 当前阶段
phase: "executing"               # received / planning / executing / failed / recovering / complete / archived
phase_since: "2026-09-20T12:05:00"
phase_owner: "java-lead"

# 阶段流转历史
phase_history:
  - phase: "received"
    at: "2026-09-20T11:50:00"
    by: "project-manager-agent"
  - phase: "planning"
    at: "2026-09-20T11:55:00"
    by: "java-lead"
  - phase: "executing"
    at: "2026-09-20T12:05:00"
    by: "java-lead"

# 各阶段完成标志（gate）
gates:
  received:
    done: true
    evidence: "current-task.yaml 创建 + PM 分派"
  planning:
    done: true
    evidence: "task-plan.yaml + knowledge-summary.md 就绪"
  executing:
    done: false
    evidence: "所有 step completed + 验收通过"
  complete:
    done: false
  archived:
    done: false
```

## 3. 与既有层的关系
- 不改 `current-task.yaml` / `task-plan.yaml` 已有结构
- `task-phase.yaml` 是**新的状态机记录层**，与 execution-state（步骤级）互补：
  - execution-state = 细粒度 step/agent 状态
  - task-phase = 粗粒度任务阶段状态
- 与 v0.3.3 Recovery 联动：`failed/recovering` 阶段由 recovery-state 驱动

## 4. 出口产物
- 每阶段完成 → 在 `phase_history` 追加记录 + 更新 `gates`
- 任务 `archived` → PM 在 current-task.yaml 置 `status: archived` + 归档指针
