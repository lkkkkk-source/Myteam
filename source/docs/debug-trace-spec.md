# Debug & Trace Spec（v1.4.1）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 核心职责，不改 Workflow 核心行为。
> 上游：v1.4 Collaboration + v1.3 Workspace + v1.2 Execution Engine + v0.4.4 Observability。
> 目标：建立 **Task Trace Runtime**，提供一次任务的完整生命周期视图。

## 0. 定位

Trace 记录一次任务跨 12 层的生命周期链路（pointer only），提供 **记录 / 查询 / 展示 / 审计**能力。**不执行、不修复、不调度、不改状态**。

Trace ≠ Memory ≠ Observability ≠ Collaboration ≠ Execution Ledger（不替代，tr-3）。

## 1. Trace Schema

`platform/debug-trace/trace-schema.yaml`：`trace_id / task_id / workflow_id / start_time / end_time / status / events[] / layers[]`；状态机 created→running→completed→failed→archived；6 不变量（tr-1~tr-6）+ forbidden（auto_execute/auto_repair/auto_decision/auto_schedule）。

## 2. Trace Event

`trace-event-schema.yaml`：`event_id / trace_id / timestamp / layer / source / event_type / reference / metadata`。layer ∈ 12 层（router/team/agent/collaboration/workspace/action/approval/execution/quality/artifact/memory/evolution）。**reference 只存 pointer**，metadata 轻量（不含代码 / 大对象，tr-1）。

## 3. Collectors

`collectors/`：router（classification/routing/planning）、collaboration（message/handoff/decision）、workspace（workspace/change/checkpoint）、execution（action/approval/execution）、quality（gate/artifact/memory/evolution）。各层在关键节点产生 trace event（pointer）。

## 4. CLI

- `myteam trace status`：当前 trace 数量。
- `myteam trace show TASK_ID`：完整链路（12 层）。
- `myteam trace timeline TASK_ID`：时间线模式。
- `myteam trace validate`：schema / reference / layer / forbidden 检查。

## 5. 集成（增 trace_ref，不复制内容）

- **Collaboration（v1.4）**：message / handoff / decision 增加 trace_ref。
- **Workspace（v1.3）**：change record / checkpoint 增加 trace_ref；不保存代码。
- **Execution（v1.2）**：execution ledger / action / approval 增加 trace_ref。
- **Memory**：只存 trace pointer + 关键 decision（不存完整 trace，tr-6）。
- **Observability（v0.4.4）**：新增 trace metrics（trace_complete_rate / missing_reference_count / avg_task_trace_duration），只分析不改行为。

## 6. project-health-agent 检查项（v1.4.1）

见第 23 项：event 完整 / reference 有效 / layer 合法 / forbidden 字段不存在 / 边界（不替代 / 不含代码）。

## 7. 硬性边界（强制）

禁止：Trace 自动执行 / 自动修复 / 自动调度 / 替代 Memory / 替代 Observability / 修改任务状态 / 修改 Agent 行为。
基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
