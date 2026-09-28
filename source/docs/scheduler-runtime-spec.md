# Scheduler Runtime Specification (v0.4.1)

> 系统从"Context 驱动执行建议"升级为"**带人工确认闭环的半自动执行系统**"。
> 核心原则：**Decision → Approval → Execute → Feedback 形成闭环**，高风险操作强制人工批准。
> **不自动执行 Agent**：所有"执行"都是 Lead 依据批准后的 decision 手动调用 Team Agent，本阶段无自动调度器进程。

## 1. 定位与边界
- **v0.4.0**：Scheduler 只产出 `execution-plan.yaml`（建议），Lead 决定是否采纳
- **v0.4.1**：Scheduler 升级为**决策 + 审批 + 执行 + 反馈**闭环
  - 决策：`decision-log`（每次调度一条决策记录）
  - 审批：`approval-queue`（pending / approved / rejected）
  - 执行：`runtime-state`（决策对应的 step 执行态）
  - 反馈：`feedback`（执行结果回填，驱动下次决策）
- **自动执行仍不做**：执行动作由 Lead 触发（属 Scheduler Runtime 阶段的"半自动"边界）

## 2. 目录结构（v0.4.1 新增）
```
.ai/context/scheduler/
├── scheduler-state.yaml          # v0.4.0（调度状态）
├── dependency-resolver.yaml      # v0.4.0（依赖解析）
├── execution-plan.yaml           # v0.4.0（执行建议）
├── policies/                     # v0.4.0（resource / priority）
├── runtime-state.yaml            # v0.4.1（决策对应 step 的运行态）
├── decision-log/
│   └── {task_id}-decision-{ts}.yaml   # v0.4.1（决策记录，只增不删）
├── approval-queue.yaml           # v0.4.1（待批准队列）
├── feedback/
│   └── {task_id}-feedback-{ts}.yaml   # v0.4.1（执行反馈，只增不删）
└── decisions/                    # v0.4.0（评估决策日志，保留）
```

## 3. 核心闭环（4 步）
```
① DECISION    Scheduler 分析依赖 + 风险 → 生成 decision-log
② APPROVAL    高风险 decision → approval-queue（pending）
              Lead / PM 批准 → approved；拒绝 → rejected
③ EXECUTE     Lead 按 approved decision 调用 Team Agent
              更新 runtime-state（running → completed/failed）
④ FEEDBACK    执行结果写 feedback/ → 驱动下次 ①（成功推进 / 失败暂停）
```

## 4. Decision Log 设计
`decision-log/{task_id}-decision-{ts}.yaml`（只增不删，审计用）：
```yaml
version: 1
task_id: "refund-feature"
decision_id: "d-20260920-001"
created_at: "2026-09-20T13:20:00"

# 决策内容
suggestion:
  result: "ready"            # ready / blocked / paused / parallel
  steps_to_run:
    - step: "step-2"
      agent: "java-developer"
      priority: "P1"
  parallel_groups:
    - group: "A"
      steps: ["step-3a", "step-3b"]

# 风险评估
risk:
  level: "normal"            # normal / high
  high_risk: false
  approval_required: false  # 高风险 = true（必须走 approval）

# 审批指针
approval_ref: null           # 高风险时指向 approval-queue 条目 id
# 执行指针
runtime_ref: "scheduler/runtime-state.yaml"
# 反馈指针（执行后回填）
feedback_ref: null
```

## 5. Approval 设计
`approval-queue.yaml`（待批准队列）：
```yaml
version: 1
task_id: "refund-feature"
updated_at: "2026-09-20T13:25:00"

queue:
  - approval_id: "ap-20260920-001"
    decision_ref: "d-20260920-002"
    step: "step-5"
    agent: "engops-release-manager"
    risk_level: "high"
    reason: "release 操作，高风险"
    status: "pending"        # pending / approved / rejected
    approver: null          # 批准人（Lead 或 PM）
    approved_at: null
    decision_note: null
```

**审批规则**：
- `risk.level = high` → **必须**进 approval-queue，状态 `pending`
- Lead 批准 → `status: approved` + 填 `approver` / `approved_at`
- 拒绝 → `status: rejected` + 填 `decision_note`
- **未批准前 Lead 不得执行该 step**（人工确认闭环核心）

## 6. Runtime State 设计
`scheduler/runtime-state.yaml`（决策对应 step 的运行态，与 execution-state 互补）：
```yaml
version: 1
task_id: "refund-feature"
updated_at: "2026-09-20T13:30:00"

# 每个 decision 对应的执行态
execution:
  - decision_ref: "d-20260920-001"
    step: "step-2"
    agent: "java-developer"
    status: "running"       # pending / running / completed / failed
    approval_status: "approved"
    started_at: "2026-09-20T13:30:00"
    feedback_ref: null

summary:
  running: 1
  completed: 0
  failed: 0
  pending_approval: 0
```

> runtime-state = "哪个 step 正在按哪个 decision 跑"；execution-state = "step 内部子进度"。

## 7. Feedback 设计
`feedback/{task_id}-feedback-{ts}.yaml`（只增不删）：
```yaml
version: 1
task_id: "refund-feature"
feedback_id: "fb-20260920-001"
created_at: "2026-09-20T13:35:00"

step: "step-2"
agent: "java-developer"
decision_ref: "d-20260920-001"

result:
  status: "completed"       # completed / failed / blocked
  output: "code artifact 已登记"
  next_hint: "step-3a/3b ready，可生成下一 decision"

# 失败时
on_failure:
  errors_ref: "runtime/errors/refund-feature-step-2.log"
  recovery_ref: "recovery/recovery-state.yaml"
  scheduler_action: "pause"  # pause / retry / waiting_user
```

**反馈闭环**：
- `completed` → Scheduler 生成下一批 ready decision（推进）
- `failed` → Scheduler 置 `paused`，读 recovery 状态（暂停，不继续）
- `blocked` → Scheduler 等待依赖（blocked）

## 8. 风险分级
| 风险级 | 触发条件 | 审批要求 |
|--------|---------|---------|
| `normal` | 普通开发 / 测试 / 文档 step | 免批（Lead 直接执行） |
| `high` | release / 数据库结构变更 / 删除操作 / 生产环境改动 | **强制 approval** |

风险分级在 `policies/risk-policy.yaml`（见下）维护。

## 9. 与既有层的关系
- 消费：task-plan / execution-state / recovery / artifacts meta（只读）
- 产出：decision-log + approval-queue + runtime-state + feedback
- **Lead 仍负责调用 Team Agent**；Scheduler 给决策，审批后 Lead 执行，反馈驱动下一次决策

## 10. 本次不实现（v0.5 Capability Index 负责）
- Agent 能力索引 / Skill 索引 / MCP 索引
- 自动调度器进程（仍为半自动）
- 跨任务全局资源优化
