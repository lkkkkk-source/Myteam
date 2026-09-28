# MyTeam Agent Platform — Model Routing Recommendation Layer

> 阶段：v0.6.8 · Model Routing Recommendation Layer（**只推荐，不执行**）
> 上承：v0.6.9 · Model Routing Feedback Loop · v0.7 · Runtime Integration Contract Layer

本层为平台**横向能力层**，在 Team → Agent 决策与最终执行之间，为每个任务推荐所需的**模型能力档位**。

## 分层流

```
Task → Router → Team → Agent → Model Recommendation → Execution
```

## 目录

| 资产 | 路径 | 职责 |
|---|---|---|
| Model Profile Schema | `registry/models/model-profile-schema.yaml` | 抽象能力等级词汇表 + Profile 字段 |
| Model Registry | `registry/models/model-registry.yaml` | 模型能力档位注册表（high-reasoning / fast-coding / long-context / general） |
| Lifecycle Policy | `registry/models/policies/model-registry-lifecycle-policy.yaml` | 档位生命周期（proposed → active → deprecated → retired） |
| Routing Policy | `model-routing/routing-policy.yaml` | 档位推荐规则（MR-1..MR-6） |
| Recommendation Schema | `model-routing/recommendation-schema.yaml` | 推荐输出结构 |
| History | `model-routing/history/model-routing-history.yaml` | 历史推荐记录（只记录，不自动学习） |
| Test Scenarios | `model-routing/tests/` | 5 个一致性测试场景 |

## 硬性边界（强制）

- **本层只登记 / 只推荐，不执行**：不自动调用模型、不自动切换 Provider、不修改 Prompt、不自动选 Agent。
- Model Registry 只登记**抽象能力档位**，**不绑定**任何具体模型 / Provider 名（绑定是未来阶段 v0.6.9+）。
- `human_confirm=true`（高风险任务）的推荐，未经人工确认不视为有效推荐。
- 变更需走 engops-lead 的 Model Registry 生命周期流程，与本平台发布流程一致。

## Runtime Integration Contract（v0.7）

- 统一平台各模块（Router / Team / Agent / Model Recommendation / Scheduler / Execution / Quality / Observability / Memory / Evolution）为 **Runtime Context 驱动**的协作层。
- 资产：`runtime/runtime-contract.yaml`（模块归属矩阵 + 流转路径 + 硬性边界）· `runtime/runtime-context-schema.yaml`（台账字段白名单 + forbidden）· `runtime/snapshot/snapshot-schema.yaml`。
- 集成台账：`.ai/context/runtime/runtime-context.yaml` + `snapshots/`（快照只读）。
- 硬性边界：**只记录 / 只定义 / 只检查**，不自动执行 / 不自动调度 / 不自动切换模型 / 不自动选 Agent。
- 详见 `source/docs/runtime-integration-contract-spec.md`。

## Runtime Action Proposal & Approval（v0.8）

- 在 Runtime Context 之上，为"具体运行时动作"建立 **Action Proposal → Approval → Execution Interface** 的治理层（Runtime Governance Layer 的一环）。
- 资产：`runtime-action/action-policy.yaml`（动作类型 / 风险分级 / 批准模型 / 硬性边界）· `action-proposal-schema.yaml`（提案字段白名单 + forbidden）· `action-template.yaml` · `records/AP-*.yaml`（提案记录）。
- Action 集成台账：`.ai/context/runtime-action/action-ledger.yaml` + `snapshots/AS-*.yaml`（快照只读）。
- 批准模型：`low → auto-approve`；`medium → agent-approval（PM）`；`high → human-approval（显式人工）`。
- 硬性边界：**只提案 / 只记录 / 只检查**，不自动执行 / 不自动批准 / 不自动绕过 / 不自动调度 / 不自动切换模型 / 不自动选 Agent；Execution Interface 本阶段不实现。
- 详见 `source/docs/runtime-action-proposal-spec.md`。

## Runtime Controlled Execution Interface（v0.9）

- Governed Agent Runtime 最后一层：将 **Approved Action** 转换为 **Controlled Execution Request**（只执行已批准动作）。
- 资产：`runtime-execution/execution-schema.yaml`（执行请求契约 + 6 不变量 + 状态机）· `executor-registry.yaml`（6 executor）· `permission-policy.yaml`（low/medium/high/critical）· `sandbox/sandbox-schema.yaml`（隔离接口）· `rollback/rollback-schema.yaml`（复用 Recovery）· `execution-ledger-schema.yaml` · `records/EX-*.yaml`。
- 执行集成台账：`.ai/context/runtime-execution/execution-ledger.yaml` + `history/`（execution metrics）+ `rollback/RB-*.yaml` + `sandbox/SB-*.yaml`。
- 三者分离：Runtime Context=状态 / Action=意图 / Execution=执行记录。
- 硬性边界：**不实现真实执行引擎**，不自动执行 / 不自动推进任务 / 不自动生成 Action / 不自动切换模型 / 不自动选 Agent / 不绕过 Approval；回滚复用 Recovery。
- 详见 `source/docs/runtime-controlled-execution-spec.md`。

## OpenCode Runtime Adapter & Deployment Governance（v1.0）

- MyTeam=**Source of Truth**，OpenCode=**Runtime Deployment**；所有部署经 **Package → Migration → Approval → Install**。
- 资产：`runtime-adapter/adapter-schema.yaml` · `opencode-adapter.yaml`（集成边界）· `agent-binding.yaml`(30) / `mcp-binding.yaml`(5) / `skill-binding.yaml`(26) · `deployment-manifest.yaml` · `migration-plan.yaml` · `rollback-plan.yaml`（复用 Recovery）· `sync-state.yaml`（drift 只报告）。
- 状态镜像：`.ai/context/runtime-adapter/adapter-state.yaml`。
- 硬性边界：**禁止直接改 runtime 作为开发方式 / runtime 反向改 source / 自动安装 / 自动升级 / 自动覆盖 / 自动删除旧版本 / 自动运行任务**；drift 只报告不修复。
- 详见 `source/docs/runtime-adapter-spec.md` · `source/docs/deployment-governance-spec.md`。

## MyTeam OpenCode Plugin Wrapper（v1.0.1）

- 将 MyTeam 封装为 **OpenCode Plugin**：OpenCode=Host Runtime，MyTeam=Independent Plugin；就地只读，宿主隔离。
- 资产：`plugin/opencode/manifest.yaml` · `index.ts`（入口）· `loader.ts`（就地只读）· `bridge.ts`（OpenCode↔MyTeam）· `myteam-plugin.yaml` · `tests/isolation-test.ps1`。
- 隔离：`copy_files=false` / `host_config_write=false` / `reversible=true`；不修改 OpenCode 核心 / 不批量复制到 `~/.config/opencode` / 不污染全局 / 不 runtime 反向改 source。
- 详见 `plugin/opencode/README.md`。

## MyTeam Plugin CLI & Developer Experience（v1.1）

- 将 MyTeam 从「开发者维护的 Plugin」升级为「用户可管理的软件工具」：CLI + Diagnostics + Lifecycle + Upgrade 管理。
- 资产：`tools/myteam-cli/`（`package.json` · `bin/myteam.mjs` · `src/index.ts` · `commands/`(init/status/doctor/validate/upgrade/rollback) · `services/`(plugin/registry/validation/migration) · `output/formatter.ts` · `tests/cli-test.ps1`）+ `plugin/opencode/plugin-state.yaml`（lifecycle state）。
- 命令：`myteam init | status | doctor | validate | upgrade --dry-run | rollback`。
- 硬性边界：CLI **只管理 状态/验证/迁移/回滚**；不安装插件 / 不改 OpenCode 配置 / 不执行任务 / 不选 Agent / 不改 Prompt / 不调 Model Routing；upgrade 默认 dry-run，rollback 不删历史。
- 详见 `source/docs/myteam-cli-spec.md` · `source/docs/developer-experience-spec.md`。

## MyTeam Controlled Execution Engine（v1.2）

- 在 v0.9 Execution Interface（契约）之上实现**受治理执行引擎**：Approved Action → Engine → Executor → Tool/MCP/Runtime → Result → Quality/Observability。
- 资产：`platform/execution-engine/`（`engine-schema.yaml` · `execution-policy.yaml` · `executor-registry.yaml` · `executors/`(code/shell/mcp/test/browser) · `permission/` · `sandbox/` · `queue/` · `result/`）+ `.ai/context/execution-engine/`（engine-state / execution-results）+ `plugin/opencode/execution-bridge.ts`。
- 三层分离：**Context=状态 / Action=意图 / Execution=执行记录**；Agent 不得直接调 Executor。
- CLI：`myteam execution status | trace TASK_ID | validate`。
- 硬性边界：只执行 **approved action + granted permission** 的请求；不自动执行未批准 Action / 不 Agent 直调 Executor / 不自动选 executor / 不自动提权 / 不改 sandbox policy / 不改 Prompt / 不改 Model Routing；critical proposal-only；failed 连 Recovery。
- 详见 `source/docs/execution-engine-spec.md` · `source/docs/executor-governance-spec.md`。

## MyTeam Project Workspace & Collaboration（v1.3）

- 建立 **Agent Workspace Runtime**：Agent → Workspace → Change Tracking → Review → Quality Gate → Merge → Artifact。
- 资产：`platform/workspace/`（`workspace-schema.yaml` · `workspace-policy.yaml` · `workspace-manager.yaml` · `agents/agent-workspace-schema.yaml` · `snapshots/checkpoint-schema.yaml` · `changes/change-record-schema.yaml` · `merge/merge-policy.yaml` · `artifacts/artifact-link-schema.yaml`）+ `.ai/context/workspace/`（workspace-state / changes / snapshots / merge-requests / artifact-links / agent-bindings）。
- **四层分离**：Workspace=工作环境 / Execution=执行过程 / Memory=元信息 / Artifact=正式产物（不合并）。
- CLI：`myteam workspace status | list | trace ID | validate`。
- 硬性边界：禁止自动 merge / Agent 绕过 workspace / 改他人 workspace / 自动删 checkpoint / workspace 替代 Memory / 替代 Artifact / 自动改权限 / 自动覆盖他人修改。
- 详见 `source/docs/workspace-layer-spec.md` · `source/docs/multi-agent-collaboration-spec.md`。

## MyTeam Agent Collaboration Protocol（v1.4）

- 建立 Agent Team 通信与协作层：Agent → Message → Handoff → Decision → Resolution → Execution。
- 资产：`platform/collaboration/`（`collaboration-schema.yaml` · `message-schema.yaml` · `handoff-schema.yaml` · `decision-schema.yaml` · `conflict-schema.yaml` · `policies/collaboration-policy.yaml`）+ `.ai/context/collaboration/`（collaboration-state / messages / handoffs / decisions / conflicts）。
- **四层边界**：Collaboration=通信 / Workspace=文件 / Memory=认知 / Execution=执行（不合并）。
- CLI：`myteam collaboration status | trace TASK_ID | conflicts | validate`。
- 硬性边界：只产生 request/decision/handoff（不直接 Execution）；禁止 Agent 自动调 Agent / 自动解决冲突 / 自动改任务目标 / 自动改 Prompt / 自动执行 / 替代 Memory / 替代 Workspace。
- 详见 `source/docs/collaboration-protocol-spec.md` · `source/docs/agent-handoff-spec.md`。

## MyTeam Debug & Trace Mode（v1.4.1）

- 建立 Task Trace Runtime：一次任务全生命周期可追踪（12 层 router→...→evolution）。
- 资产：`platform/debug-trace/`（`trace-schema.yaml` · `trace-event-schema.yaml` · `trace-policy.yaml` · `collectors/`(router/collaboration/workspace/execution/quality) · `storage/` · `queries/` · `reports/`）+ `.ai/context/debug-trace/`（trace-index + events）。
- CLI：`myteam trace status | show TASK_ID | timeline TASK_ID | validate`。
- 硬性边界：Trace 只记录 pointer + 查询 / 展示 / 审计；不执行 / 不修复 / 不调度 / 不改任务状态 / 不改 Agent 行为；Trace ≠ Memory ≠ Observability ≠ Collaboration ≠ Execution Ledger。
- 详见 `source/docs/debug-trace-spec.md` · `source/docs/task-lifecycle-trace-spec.md`。

## MyTeam Runtime Safety & Production Guard（v1.4.2）

- 为 Runtime 增加生产安全治理：资源限制 / 成本控制 / 超时 / 无限循环保护 / 高风险人工确认。
- 资产：`platform/runtime-safety/`（`safety-policy.yaml` · `risk-schema.yaml` · `budget/` · `limits/`(execution/retry/loop/concurrency) · `timeout/` · `escalation/` · `integrations/`(trace/execution/action)）+ `.ai/context/runtime-safety/`（safety-state / escalations）。
- safe-by-default；状态 normal/warning/blocked/waiting-human；critical → human_required；trace 扩展 13 层(+safety)。
- CLI：`myteam safety status | check TASK_ID | budget TASK_ID | violations | validate`。
- 硬性边界：只检测 / 限制 / 阻断 / 升级人工确认；不执行 / 不批准；禁止自动提权 / 扩预算 / 改策略 / 跳过人工确认；Safety ≠ Approval ≠ Execution Engine。
- 详见 `source/docs/runtime-safety-spec.md` · `source/docs/production-guard-spec.md`。

详见：`evolution/v0.6.8/reports/v0.6.8-report.md` · `evolution/v0.8/reports/v0.8-report.md` · `evolution/v0.9/reports/v0.9-report.md` · `evolution/v1.0/reports/v1.0-report.md` · `evolution/v1.0.1/reports/v1.0.1-report.md` · `evolution/v1.1/reports/v1.1-report.md` · `evolution/v1.2/reports/v1.2-report.md` · `evolution/v1.3/reports/v1.3-report.md` · `evolution/v1.4/reports/v1.4-report.md` · `evolution/v1.4.1/reports/v1.4.1-report.md` · `evolution/v1.4.2/reports/v1.4.2-report.md`


---

## Team Organization Model Layer（v1.4.3）

平台新增 `platform/organization/`：将 MyTeam 从 Agent Collection 升级为 **Team -> Role -> Agent** 组织模型。

- **6 Teams**：software-engineering / research / creative / engops / advisory / pm
- **Roles**：architect / developer / tester / reviewer / analyst + lead / planner / writer / ops / manager
- **Binding**：`agent-role-binding.yaml` 提供 30/30 权威映射（agent -> role -> team）
- **Registry**：`.ai/context/team-registry.yaml` 保持为 Team Runtime Registry（只增 organization_ref，不替代）
- **CLI**：`myteam organization status | trace AGENT_ID | validate`
- **边界**：只建模 / 映射 / 查询 / 验证；不执行 / 不选 Agent / 不改 Prompt；最终 Agent 决策归 PM + Approval
- **基线**：Agent=30 / MCP=5 / Skill=26 / Workflow=8 不变

---

## Organization Intelligence Layer（v1.5）

平台新增 `platform/organization-intelligence/`：MyTeam 从 Agent Organization Platform 升级为 **Self-Observing Agent Organization**。

- **metrics**：team / role / agent / collaboration / workflow performance
- **analysis**：bottleneck / failure-patterns / success-patterns / workload
- **recommendations**：recommendation-schema + records（draft -> review -> approved/rejected，人工审批）
- **report**：organization-intelligence-report.yaml
- **CLI**：`myteam intelligence status | report | bottlenecks | recommendations | validate`
- **边界**：只分析 / 只报告 / 只建议；只读来源；不自动修改 / 不自动应用 / 不生成 Agent 排名
- **基线**：Agent=30 / MCP=5 / Skill=26 / Workflow=8 不变