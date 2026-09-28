# Executor Governance Spec（v1.2）

> 与 `execution-engine-spec.md` 配套：Engine 定义"如何受治理执行"，本文定义"executor 如何被治理登记与约束"。

## 0. 目标

确保每个 Executor 的能力、风险、隔离、权限**显式登记且受约束**，Engine 依 action + policy 匹配 executor，**不自动选择、不自动提权**。

## 1. Executor 登记契约

每个 `executors/*.yaml` 必含：`id / supported_actions / risk_level / sandbox_required / permission_required / permissions / rollback_support / quality_gate`。`executor-registry.yaml` 汇总引用，`supported_actions` 必须与明细一致。

## 2. 风险 / 隔离 / 权限对齐

| risk | 授权 | sandbox | 例 |
|---|---|---|---|
| medium | PM approval | workspace-clone / temp-env | code / mcp / test |
| high | human approval | container | shell / browser |
| critical | proposal-only（不执行） | — | 数据库结构变更等 |

代码修改默认 workspace-clone；shell / browser 走 container + human confirmation。

## 3. 治理不变量

- **匹配非选择**：Engine 依 action_type 在 registry 中匹配 executor；不"智能自动选择"。
- **权限独立**：permission 授权与 action approval 分离（ee-2）；executor 的 `permission_required` 必须被 permission 层满足。
- **不自动提权**：executor risk_level 不被自动降级以绕过审批。
- **MCP 白名单**：mcp-executor 只调用已登记 5 个 MCP，不自动新增。
- **回滚**：`rollback_support=false` 的 executor（browser）失败转人工；其余复用 Recovery。
- **质量闸**：每个 executor 声明 `quality_gate`；completed 必须过 gate（不 skip_quality）。

## 4. 与 project-health-agent（第 20 项）

校验：5 executor 登记完整 / supported_actions 一致 / permission 独立 / sandbox 默认正确 / ledger 中 running/completed 均满足 approved+permission / 无 forbidden 字段。

## 5. 硬性边界（强制）

- 不自动选择 Executor / 不自动提升权限 / 不自动修改 Sandbox Policy。
- Agent 不得直接调用 Executor（必经 Action→Approval→Engine）。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
