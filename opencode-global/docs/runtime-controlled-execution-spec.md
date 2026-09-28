# Runtime Controlled Execution Interface Spec（v0.9）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 职责，不改 Workflow 核心行为。
> 上游：v0.8 Runtime Action Proposal & Approval（提供 approved Action）+ v0.3.3 Recovery（回滚复用）。
> 补上最后一层：**Approved Action → Controlled Execution**，形成 Governed Agent Runtime。

## 0. 目标

将 **Approved Action Proposal** 转换为 **Controlled Execution Request**，建立受治理的执行接口。完整链路：

```
User → Router → Team → Agent → Model Recommendation → Scheduler → Runtime Context
 ↓
Action Proposal → Approval
 ↓
Controlled Execution Interface   ← 本层（v0.9）
 ↓
Quality → Observability → Evolution
```

执行必须遵循：`Action Proposal → Approval Check → Execution Request → Controlled Executor → Result → Quality / Observability`。

**本阶段不实现真实执行引擎**：只定义接口、记录状态、做一致性检查。

## 1. Execution Layer 架构

- **`platform/runtime-execution/execution-schema.yaml`**：执行请求字段契约 + 6 条不变量（ex-1~ex-6）+ 状态机。
  - 状态：`prepared → approved → running → completed | failed → rolled_back | cancelled`。
  - ex-1：必须引用 `status=approved` 的 Action Proposal，否则拒绝进入 running。
  - ex-5：本阶段不实现真实执行引擎（status 仅登记）。
- **字段**：`execution_id / action_proposal_ref / runtime_context_ref / executor_id / target / input / permission_context / sandbox_context / rollback_strategy / status / created_at / completed_at`。

## 2. Executor Registry

`platform/runtime-execution/executor-registry.yaml`：登记执行器能力（不实现真实执行）。

| executor_id | supported_actions | permissions | rollback_support |
|---|---|---|---|
| code-workspace-executor | write-file | workspace_write | ✓ (artifact/workspace_restore) |
| test-executor | run-command / trigger-workflow | workspace_write / process_run | ✓ |
| docs-executor | write-file | workspace_write | ✓ (artifact_restore) |
| deploy-executor | deploy-artifact | human_approval / deploy_target_write | ✓ (state_restore) |
| release-executor | release-publish | human_approval / publish | ✗（需人工处理） |
| config-executor | config-change | explicit_user_confirmation / config_write | ✓ (state_restore) |

约束：`supported_actions ⊆ action-policy.action_types`；Execution.executor_id 必须存在且支持该 action_type。

## 3. Permission Model

`platform/runtime-execution/permission-policy.yaml`：Action（按 risk）→ 权限映射。

| action_class | risk | permission | approver |
|---|---|---|---|
| documentation_update | low | workspace_write | —（记录在案） |
| code_change | medium | workspace_write + review_required | PM |
| test_run | medium | process_run | PM |
| release / deploy | high | human_approval | human |
| database_change | critical | explicit_user_confirmation | human |

权限校验只做检查与拒绝，不代替 Action Approval，不自动授予权限；critical 不得降级。

## 4. Sandbox Contract

`platform/runtime-execution/sandbox/sandbox-schema.yaml`：执行隔离接口（本阶段只定义）。
- 字段：`sandbox_id / workspace / allowed_operations（白名单）/ resource_limit / cleanup_policy`。
- 隔离类型：`none / workspace-clone / temp-env / container`（未来实现）。
- 实例：`.ai/context/runtime-execution/sandbox/SB-0001.yaml`（workspace-clone）、`SB-0002.yaml`（temp-env）。

## 5. Rollback Interface

`platform/runtime-execution/rollback/rollback-schema.yaml`：**复用已有 Recovery（v0.3.3），不重设计恢复系统**。
- 字段：`rollback_id / execution_ref / strategy / checkpoint_ref / status`。
- 策略：`artifact_restore / workspace_restore / state_restore`。
- `checkpoint_ref` 引用 `.ai/context/recovery/checkpoints/*.yaml`（复用）。
- `rollback_support=false` 的 executor（release）失败转人工，不自动回滚。
- 实例：`.ai/context/runtime-execution/rollback/RB-0001.yaml`（EX-0003 failed → workspace_restore → restored）。

## 6. Runtime Integration（三者分离）

- **Runtime Context = 状态**；**Action = 意图**；**Execution = 执行记录**——三者分离，各自台账。
- Runtime Context 增加 `execution_ref`（指向 execution-ledger）；Action Proposal 概念上增加 `execution_interface_ref`（指向对应 Execution）。
- **Execution Ledger**：`.ai/context/runtime-execution/execution-ledger.yaml`——只增记录（execution_id / action_ref / executor / status / started_at / finished_at / result_ref / artifact_ref / quality_ref / rollback_ref）。
- 当前：`ec-refund-feature-001`，3 条执行（EX-0001 completed / EX-0002 cancelled-未批准 / EX-0003 rolled_back），task 与 runtime-context 对齐。

## 7. Quality 集成

Execution 完成 → 生成 `result_ref` → 连接 Quality Gate / Artifact / Observability。
流程：`Execution Result → Validation → Gate → Feedback`。EX-0001 的 `quality_ref` 指向 `refund-feature-validation.yaml`。

## 8. Observability 集成

执行历史 `.ai/context/runtime-execution/history/EX-*-history.yaml` 记录执行指标：
`execution_duration / execution_status / failure_type / rollback_count / artifact_output` → 进入 execution metrics。

## 9. project-health-agent 检查项（v0.9）

**16. Execution Contract 一致性（v0.9）**：
- **action approved before execution**：Execution `action_proposal_ref` 指向的 Action 必须 `status=approved` 才可 `running/completed`；否则须 `cancelled`（发现未批准却 running/completed → Critical，非法绕过 Approval）。
- **executor registry consistency**：`executor_id` 存在于 executor-registry，且其 `supported_actions` 覆盖该 action_type（缺 → Warning）。
- **permission policy consistency**：`permission_context.risk_level` / `granted_permission` 匹配 permission-policy（high/critical 必须人工 / 用户确认；不匹配 → Warning）。
- **rollback reference validity**：`status=rolled_back` 的 Execution 必须有 `rollback_ref` 指向存在的 rollback，且其 `checkpoint_ref` 指向真实 Recovery checkpoint（缺 → Warning）。
- **forbidden / execution-not-implemented**：Execution 层不得出现 `auto_exec / auto_advance / bypass_approval / auto_generated_action`（→ Critical）；本阶段不实现真实执行引擎。

## 10. 硬性边界（强制）

- **只定义接口 / 只记录 / 只检查**，本阶段**不实现**真实执行引擎、自动执行、自动任务推进、自动模型切换、自动 Agent Selection。
- 只执行 **approved** 的 Action；禁止绕过 Action Proposal / Approval、禁止自动生成 Action、禁止修改 Scheduler 决策、禁止自动改 Policy。
- 回滚**复用 Recovery**，不重设计恢复系统。
- Execution Ledger / Registry / Policy 由 **engops-lead 人工维护**。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**（不新增 / 不删除 / 不修改核心行为）。
