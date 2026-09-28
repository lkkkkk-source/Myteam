# Observability Specification (v0.4.4)

> 系统从"能执行任务"升级为"**能观察、分析、优化自身运行状态**"。
> Observability 是**运行观测层**：从 execution-history / failure-analysis / metrics / health-report 四个维度，
> 把已有各层（Context / Scheduler / Recovery / Quality）留下的状态变化固化为可分析的记录。

## 1. 定位与边界
- **输入**：只读取已有层的状态文件（不重复执行任务、不改变 Gate / Scheduler 判定权）
  - `runtime/execution-state.yaml` / `runtime/errors/` → step 执行历史
  - `recovery/recovery-state.yaml` → 恢复记录
  - `quality/gate-state.yaml` → 质量闸口结果
  - `memory/task-memory.yaml` → 任务级认知
- **输出**：`observability/` 下的 history / failures / metrics / health-report
- 只观测，**不执行、不判定、不修复**（执行归 Agent，判定归 Gate，修复归 Recovery）

## 2. 目录结构
```
.ai/context/observability/
├── history/                          # 执行历史（只增）
│   └── {task_id}-history.yaml        # execution-history：每次 step 执行记录
├── failures/                         # 失败分析（只增）
│   └── {task_id}-failures.yaml       # failure-analysis：失败分类 + 根因 + 恢复结果
├── metrics/
│   ├── task-metrics.yaml             # 任务级度量（duration / retries / recovery_count）
│   └── quality-metrics.yaml          # 质量度量（gate 通过率 / 返工率）
└── health-report/
    └── health-report.yaml            # 系统健康报告（各层状态汇总）
```

## 3. Execution History 设计
`history/{task_id}-history.yaml`（每次 step 执行追加一条）：
```yaml
version: 1
task_id: "refund-feature"
records:
  - seq: 1
    step: "step-1"
    agent: "java-architect"
    started_at: "2026-09-20T13:00:00"
    finished_at: "2026-09-20T13:10:00"
    duration_sec: 600
    status: "completed"
    gate_validation: "passed"     # 引用 quality 结果
    gate_review: "approved"
    gate_acceptance: "approved"
    rework_count: 0
```

## 4. Failure Analysis 设计
`failures/{task_id}-failures.yaml`（每次失败追加一条，分类统计）：
```yaml
version: 1
task_id: "refund-feature"
records:
  - seq: 1
    step: "step-4"
    type: "validation"            # compile / test / mcp_timeout / permission / quality
    root_cause: "RefundService.refund() 缺 @Transactional"
    evidence_ref: "quality/gates/refund-feature-validation.yaml"
    recovery_used: true
    recovery_strategy: "debugger"
    recovery_result: "resolved"
    recovered_at: "2026-09-20T14:00:00"

summary:
  total: 1
  by_type: { validation: 1 }
  recovered: 1
  unresolved: 0
```

## 5. Metrics 设计
`metrics/task-metrics.yaml`：
```yaml
version: 1
task_id: "refund-feature"
updated_at: "2026-09-20T14:30:00"
duration_sec: 5400
steps_total: 4
steps_completed: 3
steps_failed: 1
retries: 2
recovery_count: 1              # Recovery 成功次数（Case3 核心指标）
rework_count: 1                # review rejected 返工次数
quality_gate_failures: 1       # Gate 失败统计（Case4 核心指标）
first_pass_rate: 0.75          # 一次通过率
```

`metrics/quality-metrics.yaml`（跨任务质量趋势）：
```yaml
version: 1
updated_at: "2026-09-20T14:30:00"
tasks:
  - task_id: "refund-feature"
    gate_pass_rate: 0.75
    validation_failures: 1
    review_rejections: 1
    acceptance_first_pass: true
```

## 6. Health Report 设计
`health-report/health-report.yaml`（各层状态汇总，供 PM / 用户看系统全貌）：
```yaml
version: 1
generated_at: "2026-09-20T14:30:00"
overall: "healthy"            # healthy / degraded / unhealthy

layers:
  scheduler:
    state: "paused"
    pending_decisions: 1
    high_risk_pending: 0
  recovery:
    open_recoveries: 0
    resolved_total: 1
  quality:
    gate_pass_rate: 0.75
    open_gate_failures: 1
  task_memory:
    active_tasks: 1
    archived_total: 0
  runtime:
    running_steps: 0
    error_logs: 1

issues:
  - severity: "warning"
    layer: "quality"
    note: "step-4 validation failed → 等待 Recovery"

recommendations:
  - "完成 step-4 Recovery 后更新 gate-state"
```

## 7. Agent 职责（不新增 Agent，由现有 Agent 承担）
- **engops（主观察者）**：汇总各层状态 → 生成 history / failures / metrics / health-report；**只读已有层，不改判定**
- **java-team-lead / team-lead**：step 执行结束 → 通知 engops 追加 history
- **task-memory-agent**：归档前调用 observability 数据（task-metrics 须完整）
- **PM**：读 health-report 了解系统全貌

## 8. 与已有层集成
- Scheduler decision → observability 记录 step 执行（history）
- Recovery 成功 → recovery_count +1（failures + metrics）
- Quality Gate 失败 → quality failure 统计（metrics.quality_gate_failures）
- 任务归档（v0.4.2）→ task-metrics 定稿（Case5）

## 9. 本次不实现
- 实时监控 / 告警推送
- 跨任务趋势仪表盘（后续版本）
- 自动优化建议执行（只给 recommendations，不自动执行）
