# Recovery Specification (v0.3.3)

> Context 从"记录运行状态"升级为"具备失败恢复能力的任务运行平台"。
> **本阶段不做 Scheduler**——Scheduler 属于 v0.4 Runtime Layer。
> Recovery = 失败分类 → 策略选择 → 状态写入 → 断点恢复。

## 1. 目录结构
```
.ai/context/recovery/
├── recovery-state.yaml        # 当前任务恢复态（唯一文件）
├── strategy-registry.yaml     # 异常 → 策略 映射（声明式）
└── checkpoints/
    └── {task_id}-checkpoint.yaml  # 每任务 checkpoint（快照 + 恢复点）
```
> 与 runtime 分工：`runtime/` 记"运行态"，`recovery/` 记"失败后怎么恢复"。

## 2. Recovery State（recovery-state.yaml）
由 **Lead 在失败发生时更新**。

```yaml
version: 1
task_id: "refund-feature"
updated_at: "2026-09-20T13:00:00"

recovery:
  status: "recovered"          # none / recovering / recovered / aborted
  last_error: "errors/refund-feature-step-3.log"
  strategy: "debugger"        # 采用的恢复策略
  checkpoint: "recovery/checkpoints/refund-feature-checkpoint.yaml"

# 各 step 的恢复决策
step_recovery:
  - step: "step-3"
    error_class: "compile"
    strategy: "debugger"
    action: "java-debugger 定位 → 补 RefundRecordEntity → 重试 step-3"
    status: "recovered"
  - step: "step-3"
    error_class: "mcp_timeout"
    strategy: "retry"
    action: "重试 3 次，间隔指数退避"
    status: "pending"
```

## 3. 异常 → 策略 映射（strategy-registry.yaml）
| 异常 | error_class | 策略 | 行为 | 目标 Agent |
|------|-------------|------|------|-----------|
| 编译/运行时失败 | `compile` / `runtime` | `debugger` | 调 debugger 定位后重试 | java-debugger |
| 依赖未就绪 | `dependency` | `wait` | 等依赖 step 完成 | — |
| MCP 超时 | `mcp_timeout` | `retry` | 指数退避重试 3 次 | 原 Agent |
| 权限不足 | `permission` | `waiting_user` | 上报 PM → 用户授权 | PM |
| 对话中断 | `interruption` | `resume_point` | 从 resume_point.step 重入 | Lead |
| 阻塞（外部） | `blocked` | `escalate` | 上报 PM 决策 | PM |

## 4. Checkpoint 恢复机制（checkpoints/{task_id}-checkpoint.yaml）
```yaml
version: 1
task_id: "refund-feature"
created_at: "2026-09-20T12:45:00"

snapshot:
  step: "step-3"
  state: "failed"
  completed_before: ["step-1","step-2"]
  artifacts_done: [".ai/artifacts/architecture/refund-feature-architecture.md"]
  error_ref: "errors/refund-feature-step-3.log"

resume:
  entry: "step-3"
  strategy: "debugger"
  instruction: "java-debugger 定位编译错误 → 补 RefundRecordEntity → 重跑 step-3"
  on_success: "step-3=completed，queue 解锁 step-4"
```

**恢复流程**：
1. Lead 读 `recovery-state.yaml` → 定位 `last_error` + `strategy`
2. 读对应 `checkpoints/{task_id}-checkpoint.yaml` → 拿 `resume.entry`
3. 按策略执行（debugger / retry / resume_point / waiting_user）
4. 恢复后更新 `execution-state.yaml`（step 状态）+ `recovery-state.yaml`（status=recovered）

## 5. 四类失败场景（测试用例）
| 场景 | 触发 | 策略 | 验证 |
|------|------|------|------|
| Case1 编译失败 | developer 编译报错 | `debugger` | 生成 errors/ + recovery-state，恢复成功 |
| Case2 MCP 超时 | 调用 MCP 超时 | `retry` | retry 记录（次数/退避） |
| Case3 权限不足 | 文件/资源无权限 | `waiting_user` | 上报 PM 等用户授权 |
| Case4 对话中断 | 会话中断 | `resume_point` | 从 resume_point 继续 |

## 6. 与既有层的关系
- 不改 `current-task.yaml` / `task-plan.yaml` / `runtime/*` 结构
- 失败时：Agent 写 `runtime/errors/`（v0.3.2 已有）→ Lead 据此写 `recovery/`
- recovery 是 runtime 的"上层"，消费 runtime 的 error 记录
