# Quality Gate Specification (v0.4.3)

> 系统从"Agent 完成即认为任务完成"升级为"**Agent 产出经过验证、审查、验收后才能完成**"。
> 核心原则：**`completed`（做完了）≠ `complete`（做对了）**。
> 每个执行 step 的产出必须通过三道 Gate：validation → review → acceptance，全部通过才允许任务 `COMPLETE`。

## 1. 定位与边界
- **v0.4.2**：Task Memory 记录"目标 / 进度 / 决策 / 下一步"（认知层）
- **v0.4.3**：Quality Gate 记录"产出是否达标"（质量层）
  - **validation**：java-tester 验证（编译 / 单测 / 验收标准）
  - **review**：java-reviewer 审查（逻辑 / 表达 / 格式 / 可读性）
  - **acceptance**：PM 验收（需求对齐 / 交付标准）
- 只加状态层与规则，**不改 Agent 职责核心**；task-memory-agent 记录 Gate 状态

## 2. 目录结构
```
.ai/context/quality/
├── gate-state.yaml                    # 当前任务 Gate 总状态（唯一写入口）
└── gates/
    ├── {task_id}-validation.yaml      # validation 记录（只增）
    ├── {task_id}-review.yaml          # review 记录（只增）
    └── {task_id}-acceptance.yaml      # acceptance 记录（只增）
```

## 3. 三 Gate 状态模型
每个 step 经历三条状态轨：
```
step execution:  pending → running → completed（做完）
   ↓
validation:       pending → running → passed | failed
   ↓
review:           pending → running → approved | rejected
   ↓
acceptance:       pending → approved | rejected
```

| Gate | 负责 Agent | 结果值 | 失败去向 |
|------|-----------|--------|---------|
| validation | java-tester | `passed` / `failed` | `failed` → Recovery（策略 debugger） |
| review | java-reviewer | `approved` / `rejected` | `rejected` → 返回 java-developer 返工 |
| acceptance | PM | `approved` / `rejected` | `rejected` → 对应 Gate 重走 |

**Gate 门控规则**：
- validation `failed` → review **不得启动**（质量门槛未过）
- review `rejected` → acceptance **不得启动**
- 三 Gate 全 `approved` / `passed` → 任务可置 `COMPLETE`
- 任一 Gate 未通过 → 任务**不得结束**（Case1 核心：developer completed 只是 step 完成，非任务完成）

## 4. Gate State 设计
`quality/gate-state.yaml`（唯一写入口，PM 维护汇总）：
```yaml
version: 1
task_id: "refund-feature"
updated_at: "2026-09-20T14:00:00"

gates:
  - step: "step-2"
    validation: "passed"      # pending / running / passed / failed
    review: "approved"         # pending / running / approved / rejected
    acceptance: "approved"    # pending / approved / rejected
    result: "passed"          # 三 Gate 全通过 = passed；否则 pending / failed
  - step: "step-4"
    validation: "failed"
    review: "pending"
    acceptance: "pending"
    result: "failed"

task_gate: "in-progress"     # in-progress / passed / failed
# 任务 complete 条件：所有 step.result = passed 且 task_gate = passed
```

## 5. 与 Scheduler 的集成
- Scheduler 的 decision 在 **step completed 后** 才推进下一 ready step
- 推进条件升级为：`step.completed AND step.validation.passed`
- validation `failed` → Scheduler 读 recovery-state 置 `paused`（同 v0.4.1 失败暂停逻辑）
- review `rejected` → Scheduler 生成"返工 decision"（重新调度 developer）

## 6. 与 Task Memory 的集成
- task-memory-agent 在 Gate 状态变化时更新 `task-memory.yaml` 的 `progress` / `quality` 块
- 归档时（v0.4.2 流程）须含 `quality` 最终状态（全 Gate passed 才归档）
- `gate-state.yaml` 指针登记到 `current-task.yaml` + `task-memory.yaml`

## 7. Agent 职责映射
| Agent | Gate 动作 |
|-------|----------|
| java-developer | 产出代码 → 状态 `completed`（**仅 step 完成，非任务完成**） |
| java-tester | 执行 validation → 写 `gates/{task}-validation.yaml`（passed/failed） |
| java-reviewer | 执行 review → 写 `gates/{task}-review.yaml`（approved/rejected） |
| PM | 执行 acceptance → 写 `gates/{task}-acceptance.yaml`；汇总 `gate-state.yaml`；决定 `COMPLETE` |
| task-memory-agent | 记录 Gate 状态到 task-memory；归档前校验全 Gate passed |

## 8. 本次不实现
- 自动化测试执行（tester 仍手动触发）
- 质量指标统计 / 趋势（后续版本）
- 跨任务质量画像
