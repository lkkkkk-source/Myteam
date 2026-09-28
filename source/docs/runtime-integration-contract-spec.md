# Runtime Integration Contract Spec（v0.7）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 职责，不改 Workflow 核心行为。
> 上游：v0.6.8 Model Routing Recommendation + v0.6.9 Routing Feedback Loop。
> 在既有各模块（Router / Team / Agent / Model Recommendation / Scheduler / Execution / Quality / Observability / Evolution / Memory）之上，建立**统一 Runtime Context 驱动的协作层**。

## 0. 目标

将平台从"多个 Agent Platform 能力模块各自独立工作"，升级为：

**统一 Runtime Context 驱动的平台**——所有模块通过 **Runtime Contract** 协作。

```
User
 ↓
Router → Team → Agent → Model Recommendation → Scheduler → Execution → Quality → Observability → Evolution
```
（完整：User → Router → Team → Agent → Model Recommendation → Scheduler → Execution → Quality → Observability → Evolution）

## 1. Runtime Context 设计

Runtime Context = **模块协作的统一运行时上下文**，由两部分组成：

1. **集成台账（ledger）**：`.ai/context/runtime/runtime-context.yaml`
   - 记录每个模块的 `provides`（其自有的上下文文件/目录）、`state`、`owner_agent`、`contract_ok`。
   - **只记录「谁 / 提供什么 / 状态 / 契约是否合规」，不复制各模块细节**（细节留在各模块自有文件）。
2. **各模块自有上下文**：`.ai/context/{router|scheduler|runtime|quality|observability|memory|...}/` 等——由对应 owner 维护。

集成台账是"横切视图"：它知道所有模块当前在哪、是否合规，从而让跨模块协调可追溯。

## 2. Runtime Contract 设计

Runtime Contract = 模块协作的"宪法"，位于 `platform/runtime/runtime-contract.yaml`：

- **模块清单 + 上下文归属矩阵**：每个模块的 `owner_agent`（有权写入）与 `reader_agents`（只读消费者）。
  - 例如 `model-routing`：owner = engops-lead；reader = project-manager-agent / project-health-agent。
  - 防止越权：同一段上下文只允许其 owner 写入（冲突 → Contract 违规）。
- **跨模块流转路径**：`flow.sequence` 定义最终架构流转顺序。
- **硬性边界**：明确本阶段**不实现** auto-execute / auto-schedule / auto-model-switching / auto-agent-selection / auto-contract-mutation。
- **字段集**：`platform/runtime/runtime-context-schema.yaml` 定义台账允许字段 + forbidden_fields（自动执行/调度/切换/选择相关字段为 **forbidden**）。

### 字段约束（schema）
- 合法字段：`version / context_id / task_id / contract_version / updated_at / owner / modules[] / snapshot_refs`。
- 每个 `module_entry` 合法字段：`id / name / provides / state / owner_agent / contract_ok / last_write_at`。
- **forbidden**：`auto_exec / auto_schedule / auto_model_switch / auto_agent_select`——出现即 **Contract 违规（Critical）**。

## 3. 模块连接关系

| 模块 | 上下文提供物 | owner（写入） | 只读消费者 | 契约链路 |
|---|---|---|---|---|
| Router | `.ai/context/router/` | PM | EngOps-lead / Health | 任务入口 |
| Team | `.ai/context/team-registry.yaml` | PM | EngOps-lead | 组织分派 |
| Agent / Capability | `.ai/context/capability/` | EngOps-lead | PM / Health | 能力选择 |
| Model Routing | `platform/model-routing/` | EngOps-lead | PM / Health | 模型推荐 |
| Scheduler | `.ai/context/scheduler/` | PM | EngOps-lead | 执行计划 |
| Execution | `.ai/context/runtime/execution-state.yaml` | PM（Lead 人工更新） | EngOps-lead / Health | 执行状态 |
| Quality | `.ai/context/quality/` | PM | EngOps-lead | 质量门禁 |
| Observability | `.ai/context/observability/` | EngOps-lead | Health | 观测 |
| Task Memory | `.ai/context/memory/` | Knowledge-Mgr | PM | 记忆 |
| Evolution | `evolution/` | EngOps-lead | Health | 进化 |

每步流转通过 Runtime Contract 校验上游提供物存在且 `contract_ok=true`（只校验，不自动调度）。

## 4. Snapshot 机制

- **触发**：contract_version 变化时（`on-contract-change`）留快照。
- **快照**：`.ai/context/runtime/snapshots/RC-SNAP-*.yaml`，记录 `contract_version + modules_summary`（各模块 state + contract_ok 只读汇总）。
- **用途**：给跨模块协调状态留底、可追溯、可回滚。
- **约束**：快照**只读**，不用于自动调度；任何 Agent 不得修改既有快照。

## 5. 一致性检查（project-health-agent）

新增 **Runtime Contract 一致性（v0.7）** 检查项：
- 台账 `runtime-context.yaml` **合法字段**：字段必须落在 `runtime-context-schema.yaml` 的白名单（出现非法字段 → Warning，schema 违规）。
- **模块 id 一致性**：台账 `modules[].id` 必须存在于 `platform/runtime/runtime-contract.yaml` 的 `modules[].id`（缺 → Warning，悬空）。
- **owner 权限**：台账每个模块 `owner_agent` 必须匹配 contract 的 owner_agent（不匹配 → Warning，越权写入）。
- **provides 指向校验**：每个 `provides` 指向的文件/目录真实存在（不存在 → Warning，悬空引用）。
- **Contract 违规检测**：台账出现 forbidden 字段（auto_exec / auto_schedule / auto_model_switch / auto_agent_select）→ **Critical**，Contract 违规。
- **Snapshot 一致性**：台账 `snapshot_refs` 指向的快照存在，且快照 `contract_version` 与台账一致；snapshot 只读不可改。
- **不自动执行**：只报告 + 建议，不执行任何调度 / 切换 / 选择 / 变更。

## 6. 硬性边界（强制）

- Runtime Contract / Context 台账**只记录、只定义、只检查**；不在本阶段做任何自动执行 / 调度 / 切换 / 选择。
- 台账由 **engops-lead 人工维护**；任何 Agent 不得自动改写 Runtime Contract。
- 快照只读；跨模块协作以人工协调 + 契约校验为依据。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**（不新增 / 不删除 / 不修改核心行为）。
