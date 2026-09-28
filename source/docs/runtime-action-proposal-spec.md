# Runtime Action Proposal & Approval Spec（v0.8）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 职责，不改 Workflow 核心行为。
> 上游：v0.7 Runtime Integration Contract Layer（基础）+ v0.6.6 Scheduler（产出计划）。
> 在 Runtime Context 之上，为"具体运行时动作"建立 **Action Proposal → Approval → Execution Interface** 的**治理层**（Runtime Governance Layer 的一环）。

## 0. 目标

解决："Scheduler 产出计划、Runtime Context 记录状态，但**具体要执行的动作**（跑命令 / 触发工作流 / 部署 / 发布）没有统一的提案与审批治理"。

建立 **Action Proposal & Approval** 协议，让"可执行动作"在进入执行前必须：

```
User
 ↓
Router
 ↓
Team
 ↓
Agent
 ↓
Model Recommendation
 ↓
Scheduler          （产出计划，不是批准）
 ↓
Runtime Context    （记录模块状态）
 ↓
Action Proposal    （提出具体动作）
 ↓
Approval           （批准 / 拒绝）
 ↓
Execution Interface（本阶段【不】实现真正执行）
 ↓
Quality → Observability → Evolution
```

## 1. Action Layer 设计

- **权威策略**：`platform/runtime-action/action-policy.yaml`（Action Governance 的"宪法"）。
  - **验收不变量**（ap-1 ~ ap-4）：未批准不得进入 Execution Interface（ap-1）；高风险必须显式人工批准（ap-2）；提案不得含 forbidden auto 字段（ap-3）；Scheduler 只产出计划不产自批准动作，Execution Interface 本阶段不实现（ap-4）。
- **Action 类型**（action_type）：`run-command` / `trigger-workflow` / `write-file` / `deploy-artifact` / `release-publish` / `config-change`，各自绑定未来 exec_interface 与 default_risk。
- **风险 / 批准模型**：`low → auto-approve`；`medium → agent-approval（PM）`；`high → human-approval（显式人工）`。
- **批准状态机**：`draft → pending → approved | rejected | cancelled`。
- **Snapshot**：`AS-*.yaml` 只读留底（on-ledger-change），保证可追溯 / 可回滚。

## 2. Proposal Schema

- **提案 schema**：`platform/runtime-action/action-proposal-schema.yaml`，定义 `proposal_id / task_id / action {action_type,target,detail} / risk {level,approval_model,approver} / status / decision {approved_by,approved_at,decision_note}`。
- **模板**：`platform/runtime-action/action-template.yaml`（engops-lead / PM 人工复制创建）。
- **记录**：`platform/runtime-action/records/AP-*.yaml`（每个提案一个文件，生命周期透明）。
- **forbidden 字段**：`auto_exec / auto_approve / auto_bypass / executed / result`——出现即 **Action Contract 违规（Critical）**。

## 3. Approval 模型

- 批准权**归属 approver**（见 risk 派生）：
  - `low` → 自动批准并记录（auto-approve，仅只读 / 探查类）。
  - `medium` → `project-manager-agent` 批准（agent-approval）。
  - `high` → **显式 human** 批准（human-approval），无人工批准绝不进入执行。
- **禁止自动批准 / 绕过**（强制）：低风险以外的批准权不可被自动行使（auto-approval / auto-bypass = 未实现）。
- 每个批准决策写入 `decision`（approved_by / approved_at / decision_note），**可追溯、可回滚**。

## 4. Runtime 集成

- **Action Ledger（台账）**：`.ai/context/runtime-action/action-ledger.yaml`
  - 只记录每个 action proposal 的引用、风险等级、批准模型、状态与 `contract_ok`；**不复制提案细节、不执行**。
  - 当前：`ac-refund-feature-001`，3 个提案（AP-0001 approved / AP-0002 pending / AP-0003 draft），policy_version=1，全部 contract_ok=true。
- **Action Ledger Schema**：`platform/runtime-action/action-ledger-schema.yaml`（字段白名单 + forbidden）。
- **快照**：`.ai/context/runtime-action/snapshots/AS-20260921-0001.yaml`——`ledger.version` 变化时留底；只读汇总提案状态。
- **与 v0.7 对齐**：Ledger / 提案的 `task_id` 与 runtime-context 台账的 `task_id` 一致；Action Governance 作为 Runtime Context 之上的秩序层协作，不新增模块。

## 5. Scheduler 边界

- Scheduler（v0.6.6）**只产出计划**（execution-plan / runtime-state / approval-queue 等），**不产出自批准动作**。
- 既有 scheduler 的 `approval-queue.yaml`（如高风险 release 步骤）应升级为通过本层 **Action Proposal → Approval** 记录；本层提供统一、可追溯的治理协议。
- Scheduler 的待批准步骤**不自动执行**；批准权 + 是否进入执行，均由 Action Approval 决定（本阶段不实现 Execution）。
- 防止"Scheduler 自动调度直接变成执行"：任何动作需先成为 Action Proposal 并经批准（ap-1 / ap-4）。

## 6. project-health-agent 检查项（v0.8）

**15. Action Contract 一致性（v0.8）** 检查项：
- **schema 完整性**：Action Proposal / Ledger 字段必须落在 `action-proposal-schema.yaml` / `action-ledger-schema.yaml` 白名单（出现非法字段 → Warning，schema 违规）。
- **approval 规则一致性**：提案 `risk.level` / `approval_model` / `approver` 必须匹配 `action-policy.yaml` 的 risk_levels 派生关系（不匹配 → Warning，approval 规则违规）；`task_id` 必须存在于 runtime-context 台账（缺 → Warning，悬空）。
- **forbidden auto execution 检查**：Ledger / 提案出现 `auto_exec / auto_approve / auto_bypass / executed / result` → **Critical**（Action Contract 违规，非法自动执行 / 自动批准 / 绕过）。
- **Snapshot 一致性**：Ledger `snapshot_refs` 指向的快照存在且 `ledger_ref` 对齐；快照只读不可改。
- **Execution 未实现**：Action 层（提案 / 台账 / 快照）中不得出现任何"已执行 / 执行结果"记录（若发现 → 视为违规，Execution Interface 本阶段不实现）。

## 7. 硬性边界（强制）

- **只提案 / 只记录 / 只检查**，本阶段**不实现**任何自动执行 / 自动调度 / 自动切换 / 自动选择 / 自动批准 / 自动绕过。
- Action Policy / Proposal / Ledger 由 **engops-lead 人工维护**；任何 Agent 不得自动改写（auto-action-mutation = 未实现）。
- 快照只读；批准权归属 approver / human，**不自动行使**。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**（不新增 / 不删除 / 不修改核心行为）。
