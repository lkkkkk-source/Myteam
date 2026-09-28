# Runtime Safety Spec（v1.4.2）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 核心职责，不改 Workflow 核心行为。
> 上游：v1.2 Execution Engine + v0.8 Action Proposal + v1.4.1 Trace + v0.3.3 Recovery。
> 目标：为 MyTeam Runtime 增加生产安全治理：资源限制 / 成本控制 / 超时 / 无限循环保护 / 高风险人工确认。

## 0. 定位

Safety Layer **只限制风险**：不改 Router / Agent Selection / Model Routing / Execution Policy / Quality Gate；不替代 Approval / Execution Engine（sf-4）。**safe-by-default**（sf-1）。

## 1. Safety Policy

`platform/runtime-safety/safety-policy.yaml`：safe-by-default；状态机 normal/warning/blocked/waiting-human；execution gate status（allowed/warning/blocked/human_required）；6 不变量（sf-1~sf-7）+ forbidden（auto_override/auto_retry_forever/auto_escalate_permission/auto_expand_budget）。

## 2. Budget Control

- **Token Budget**（`budget/token-budget-schema.yaml`）：task_id/model_class/token_limit/used/remaining/status。超限 → waiting-human；禁止自动扩预算。
- **Cost Budget**（`cost-budget-schema.yaml`）：estimated/actual/limit/status。
- **Budget Policy**：默认 token 200k / cost $5 / warning 阈值 80%。

## 3. Limits

- `execution-limit.yaml`：max_execution_time=30m / max_retry=3 / max_parallel=5。
- `retry-limit.yaml`：同一 task/action/execution 最大 retry=3；禁止无限循环；达上限 → Recovery / human。
- `loop-detection.yaml`：重复 action / 相同错误 / 相同失败原因 / 重复 handoff → suspected-loop → blocked。
- `concurrency-limit.yaml`：max_parallel=5 / per_agent=2 / per_workspace=1。

## 4. Timeout

`timeout/timeout-policy.yaml`：execution 30m → Recovery；approval 24h / human 72h 超时 → 提醒（不自动放行）。

## 5. Human Escalation

`escalation/human-escalation-policy.yaml`：必须人工确认场景 = production deployment / database schema change / security sensitive / budget exceeded / repeated failure / loop blocked。流程：Safety Check → Human Confirmation → Action Approval → Execution Engine。**human confirmation ≠ Action Approval**（两者独立）。

## 6. 集成

- **Trace（v1.4.1）**：每次 safety decision 生成 trace event（layer=safety，13 层）。
- **Execution Engine（v1.2）**：执行前读 safety status（allowed/warning/blocked/human_required，sf-5）；blocked → 拒绝；human_required → 待确认。
- **Action（v0.8）**：Action Proposal 增 safety_check_ref；blocked/waiting-human 不进入 approved。

## 7. CLI

`myteam safety status | check TASK_ID | budget TASK_ID | violations | validate`。

## 8. project-health-agent 检查项（v1.4.2）

见第 24 项：budget schema / limit policy / escalation rule / trace reference / forbidden 字段 / 边界（不替代 Approval / Execution Engine）。

## 9. 硬性边界（强制）

禁止：自动提高权限 / 自动扩大预算 / 自动修改安全策略 / 自动跳过人工确认 / Safety 替代 Approval / 替代 Execution Engine / 修改 Agent 行为。
基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
