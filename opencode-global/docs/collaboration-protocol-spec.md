# Collaboration Protocol Spec（v1.4）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 核心职责，不改 Workflow 核心行为。
> 上游：v1.3 Workspace + v1.2 Execution Engine + v0.4.2 Task Memory。
> 目标：建立 Agent Team 通信与协作层：`Agent → Message → Handoff → Decision → Resolution → Execution`。

## 0. 定位与四层边界（强制）

- **Collaboration = 管理 Agent 间交流**（本层）
- **Workspace = 管理文件和修改**（v1.3）
- **Memory = 管理任务认知**（.ai/context/memory）
- **Execution = 管理实际执行**（v1.2）
- Collaboration ≠ Memory ≠ Workspace ≠ Execution（cl-4，不合并）。

## 1. Collaboration Schema

`platform/collaboration/collaboration-schema.yaml`：字段 `collaboration_id / task_id / participants / team / status / created_at`；状态机 `created → active → waiting → resolved → archived`；7 不变量（cl-1~cl-7）+ forbidden_fields（auto_resolve / auto_execute / auto_delegate / auto_call_agent）。

## 2. Message Protocol

`message-schema.yaml`：`message_id / from_agent / to_agent / task_id / type / content / evidence_ref / created_at`；type ∈ {information, request, response, handoff, decision, review, conflict}。**content 只保存结论 + evidence_ref，不保存完整聊天 / 完整代码**（cl-3）。

## 3. Handoff Protocol

`handoff-schema.yaml`：`handoff_id / from / to / task_context / completed_work / remaining_work / constraints / evidence / acceptance`。handoff 产出下游 action proposal，不直接 Execution（cl-1）。

## 4. Decision Exchange

`decision-schema.yaml`：`decision_id / owner / problem / options / selected_option / reason / impact / evidence / risk`。必须记录 reason；high/critical 决定不自动替用户做（cl-5）。

## 5. Conflict Resolution

`conflict-schema.yaml`：`conflict_id / participants / issue / positions / evidence / resolution / resolver`；状态 open/reviewing/resolved/rejected。**冲突不自动解决**，resolver 由人工 / lead 裁决。

## 6. Collaboration Policy

`policies/collaboration-policy.yaml`：允许 发消息 / 请求 / handoff / decision / conflict；**禁止** Agent 自动调用其他 Agent / 自动改任务目标 / 自动绕过 PM / 自动批准高风险 / 直接 Execution / 自动解决 / 自动委派 / 自动改 Prompt。

## 7. 集成

- **Workspace（v1.3）**：message 引用 workspace_ref；change 引用 message_ref；review 引用 discussion_ref；**消息不含完整代码**。
- **Memory**：只存 collaboration pointer / key decisions / unresolved questions（不存完整消息历史）。
- **Execution（v1.2）**：collaboration 只产生 request/decision/handoff → Action Proposal → Approval → Execution Engine。

## 8. CLI

`myteam collaboration status | trace TASK_ID | conflicts | validate`。

## 9. project-health-agent 检查项（v1.4）

见第 22 项：schema / message（结论 only）/ decision（reason + 非自动 high-risk）/ conflict（resolver + 非自动）/ policy compliance / 四层边界。

## 10. 硬性边界（强制）

禁止：Agent 自动调用 Agent / 自动解决冲突 / 自动改变任务目标 / 自动修改 Prompt / 自动执行 Action / Collaboration 替代 Memory / 替代 Workspace。
基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
