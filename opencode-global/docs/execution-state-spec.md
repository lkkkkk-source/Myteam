# Execution State Specification (v0.3.2)

> Context 从"记录任务信息"升级为"记录任务运行状态"。
> **本阶段不实现自动调度**——state 文件是**状态记录**，由 Agent/Lead 手工更新；
> 调度（Scheduler / Event Bus / 自动重排）留给 v0.4。Recovery 读取本文件留给 v0.3.3。

## 位置
`.ai/context/runtime/`

```
runtime/
├── execution-state.yaml    # 当前任务运行状态（唯一文件，单任务）
├── queue/
│   └── pending-steps.yaml  # 待执行步骤队列（声明式，非自动调度）
└── errors/
    └── {task_id}-{step}.log # 错误记录（结构化，供 Recovery 层消费）
```

## 1. Execution State（execution-state.yaml）

由 **Lead 在任务生命周期关键节点更新**。记录"现在运行到哪、谁在跑、产物齐没齐"。

```yaml
version: 1
task_id: "refund-feature"
team: "java"
updated_at: "2026-09-20T12:30:00"
owner: "java-lead"            # 当前责任 Lead

# 步骤级执行态（对应 task-plan.yaml 的 steps）
steps:
  - id: step-1
    agent: "java-architect"
    status: "completed"       # pending / running / completed / failed / blocked / skipped
    started_at: "2026-09-20T11:55:00"
    finished_at: "2026-09-20T11:58:00"
    output: ".ai/artifacts/architecture/refund-feature-architecture.md"
  - id: step-2
    agent: "java-planner"
    status: "completed"
    started_at: "2026-09-20T12:00:00"
    finished_at: "2026-09-20T12:05:00"
    output: ".ai/tasks/refund-feature/task-plan.yaml#step-3..6"
  - id: step-3
    agent: "java-developer"
    status: "running"         # 进行中
    started_at: "2026-09-20T12:30:00"
    finished_at: null
    output: null
  - id: step-4
    agent: "java-developer"
    status: "pending"
    parallel_group: "A"      # 与 step-3 同组，可并行
  - id: step-5
    agent: "java-reviewer"
    status: "pending"
    depends_on: ["step-3","step-4"]

# Agent 当前状态（谁在跑）
agent_status:
  - agent: "java-architect"
    status: "completed"
  - agent: "java-developer"
    status: "running"
    since: "2026-09-20T12:30:00"

# 整体进度
progress:
  total: 6
  completed: 2
  running: 1
  pending: 3
  next_step: "step-4"        # 下一个可进入的步骤（step-3 完成后）
```

## 2. Agent Status 取值
`pending` / `running` / `completed` / `failed` / `blocked` / `skipped`

- `running`：Agent 正在执行（Lead 分派后置）
- `completed`：产物已落盘且登记（Agent 结束后置）
- `failed`：执行失败，需写 `errors/{task_id}-{step}.log`
- `blocked`：被外部因素阻塞（依赖未就绪 / 资源缺失）

## 3. Queue（queue/pending-steps.yaml，声明式）
> **不是自动调度器**。只是"下一步待跑"的声明记录，v0.4 Scheduler 会消费它。
> 本阶段由 Lead 维护，Agent 不自动触发。

```yaml
version: 1
task_id: "refund-feature"
pending:
  - step: "step-4"
    agent: "java-developer"
    parallel_group: "A"
    ready: false              # step-3 未完成，未就绪
    reason: "等待 step-3 完成"
  - step: "step-5"
    agent: "java-reviewer"
    ready: false
    reason: "等待 step-3/4 完成"
last_updated: "2026-09-20T12:30:00"
```

## 4. Error（errors/{task_id}-{step}.log，结构化）
Agent/Lead 遇错写入。YAML 结构，供 v0.3.3 Recovery 层解析。

```yaml
version: 1
task_id: "refund-feature"
step: "step-3"
agent: "java-developer"
time: "2026-09-20T12:45:00"
severity: "major"             # minor / major / blocker
message: "编译失败：缺少 RefundRecordEntity 依赖"
cause: "java-planner 未细化 step-4 的实体定义"
recovery_hint: "回退 step-2 重新细化，或直接补 RefundRecordEntity"
```

## 更新时机（由谁在何时改）
| 节点 | 更新者 | 改什么 |
|------|--------|--------|
| Lead 分派 step 给 Agent | Lead | `agent_status` → running |
| Agent 完成产物 | Agent/Lead | step → completed + output + finished_at |
| Agent 失败 | Agent/Lead | step → failed + 写 errors/ + agent_status → failed |
| step 完成 | Lead | queue 里下一项 ready=true + progress |

## 与 v1.0/v1.1 的关系
- 不改 `current-task.yaml` / `task-plan.yaml` 已有结构
- `execution-state.yaml` 是**新的运行态记录层**，与任务信息层（task-plan）分离
- v0.3.3 Recovery 读取 `execution-state` + `errors/` 实现断点恢复
