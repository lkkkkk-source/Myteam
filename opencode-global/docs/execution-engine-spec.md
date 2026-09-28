# Execution Engine Spec（v1.2）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 核心职责，不改 Workflow 核心行为。
> 上游：v0.8 Action Proposal & Approval（提供 approved action）+ v0.9 Controlled Execution Interface（契约）+ v0.3.3 Recovery（失败连接）。
> 目标：实现 `Approved Action → Execution Engine → Executor → Tool/MCP/Runtime → Result → Quality/Observability`。

## 0. 定位

Execution Engine 是**受治理执行引擎**：只执行【已治理通过】的请求。**不负责**决定任务 / 选择 Agent / 修改 Prompt / 自动批准 Action / 绕过 Governance。

三层分离（强制）：**Context=记录状态 / Action=记录意图 / Execution=记录实际执行**。
禁止 Agent 直接调用 Executor；正确路径：`Agent → Action Proposal → Approval → Execution Engine → Executor`。

## 1. Engine Schema

`platform/execution-engine/engine-schema.yaml`：
- Execution Request 字段：`execution_id / action_ref / task_id / executor / permission / sandbox / input / status`。
- 状态机：`prepared → authorized → queued → running → completed | failed | cancelled → rolled_back`。
- 7 条不变量（ee-1~ee-7）+ forbidden_fields（`auto_execute / auto_approve / bypass_permission / skip_quality`）。
- 关键：ee-1（引用 approved action）、ee-2（permission 与 approval 独立、都满足才 running）、ee-3（Agent 不直调 Executor）、ee-5（失败连 Recovery）、ee-6（critical proposal-only）。

## 2. Executor Registry

`executor-registry.yaml` + `executors/*.yaml`（5 个）：

| executor | supported_actions | risk | sandbox | permission |
|---|---|---|---|---|
| code-executor | create_file/modify_file/refactor_code | medium | workspace-clone | workspace_write |
| shell-executor | run_command | high | container | process_run + human_approval |
| mcp-executor | call_mcp_tool | medium | temp-env | mcp_invoke（仅 5 个已登记 MCP）|
| test-executor | run_test | medium | temp-env | process_run + workspace_write |
| browser-executor | browser_action | high | container | browser_control + human_approval（经 playwright）|

## 3. Execution Policy

`execution-policy.yaml`：`low`=允许 approved execution；`medium`=PM approval；`high`=human approval；`critical`=**禁止自动执行，只生成 proposal**（不进入引擎）。**禁止自动提升权限。**

## 4. Permission Layer

`permission/execution-permission.yaml`：`execution_id / requested_permission / approved_by / scope / expires_at`。**permission ≠ action approval**（两个独立状态，都满足才 running）；过期失效；`approved_by=null` → permission denied（blocked）。

## 5. Sandbox Layer

`sandbox/sandbox-policy.yaml`：`none / workspace-clone / temp-env / container`。代码修改默认 workspace-clone；危险操作（shell/browser）走 container + human confirmation。

## 6. Queue / Result

- `queue/execution-queue.yaml`：pending / authorized / running / completed / failed；**只记录，不自动调度**。
- `result/execution-result-schema.yaml`：`execution_id / executor / output / artifacts / errors / quality_ref / observability_ref / recovery_ref`。completed 连 Quality/Observability；failed（errors 非空）必须有 recovery_ref。

## 7. OpenCode Plugin 集成

`plugin/opencode/execution-bridge.ts`：MyTeam Execution Engine → OpenCode Runtime。`admitExecution`（只准入 approved action + granted permission + authorized）、`refuseActionGeneration`（Plugin 不生成 Action）、`guardExecutionTarget`（宿主写守卫，继承 v1.0.1 隔离）。

## 8. CLI

`myteam execution status`（执行状态）/ `myteam execution trace TASK_ID`（Action→Approval→Execution→Result）/ `myteam execution validate`（executor registry / permission / sandbox / policy / forbidden 字段）。

## 9. project-health-agent 检查项（v1.2）

见 `project-health-agent.md` 第 20 项：schema / executor registry / permission 独立 / sandbox / ledger（approved+permission 才 running）/ forbidden / 三层分离 / 失败连 Recovery。

## 10. 硬性边界（强制）

- 只执行已治理通过的请求；禁止自动执行未批准 Action / Agent 绕过 Engine / 自动选 Executor / 自动提权 / 自动改 Sandbox Policy / 自动改 Prompt / 自动改 Model Routing。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
