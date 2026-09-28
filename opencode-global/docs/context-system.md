# Context System

> OpenCode Agent Platform v0.3.0 → Context System v1.1 → v0.3.2 Execution State → v0.3.3 Recovery → v0.3.4 Lifecycle → **v0.4 Scheduler + v0.4.1 Runtime + v0.8 Action Governance**（增量升级，不破坏既有版本）。
> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 职责，不改 Workflow 核心行为。

## 0. 版本
- **v1.0**：current-task.yaml / task-plan.yaml / artifact / handoff_log / resume_point
- **v1.1**：Team Context + Knowledge Integration + 增强 Agent 协作上下文
- **v0.3.2**：Execution State + Agent Status + 声明式 Queue + Error 记录（记录运行状态）
- **v0.3.3**：Recovery Layer —— 失败分类 → 策略 → 断点恢复
  > Context 从"记录运行状态"升级为"具备失败恢复能力的任务运行平台"。
- **v0.3.4（新增）**：Task Lifecycle + Artifact Lifecycle —— 任务五阶段状态机 + artifact 状态机
- **v0.4（新增）**：Scheduler Planner —— 依赖解析 / ready-blocked 判断 / parallel 建议 / execution-plan
  > Context 从"人工查看决定下一步"升级为"**Context 驱动的执行建议系统**"。
- **v0.4.1（本版新增）**：Scheduler Runtime —— decision-log / approval-queue / runtime-state / feedback 闭环
  > 从"执行建议"升级为"**带人工确认闭环的半自动执行系统**"。
  > **不自动执行 Agent**（半自动边界：Lead 触发执行）。
- **v0.4.2（本版新增）**：Task Working Memory —— task-memory.yaml（目标/进度/决策/下一步）+ archive
  > 从"依赖聊天上下文"升级为"**依赖结构化 Task Memory 执行**"（新会话/压缩/交接可恢复）。
- **v0.4.3（本版新增）**：Quality Gate Layer —— validation / review / acceptance 三道 Gate + gate-state
  > 从"Agent 完成即认为完成"升级为"**产出经过验证、审查、验收后才能完成**"。
  > 核心原则：**`completed`（做完了）≠ `complete`（做对了）**；developer completed 只是 step 完成，非任务完成。
- **v0.4.4（本版新增）**：Observability Layer —— execution-history / failure-analysis / task-metrics / health-report
  > 从"能执行任务"升级为"**能观察、分析、优化自身运行状态**"。
  > 由 engops-lead 担任主观察者（不新增 Agent）；只读已有层，不改判定。
- **v0.5（本版新增）**：Capability Registry —— agent-capabilities / skill-registry / mcp-registry / capability-feedback
  > 从"固定 Agent 编排"升级为"**基于能力查询的智能编排基础**"。
  > 只负责查询能力（谁有什么能力 / Skill 提供什么 / MCP 支持什么），**不决定执行**（不自动选 Agent / 不自动调度 / 不打分）。
- **v0.5.1（本版新增）**：Capability Analytics —— capability-metrics / agent-performance / trend / analytics-report
  > 从"知道有哪些能力"升级为"**知道这些能力实际运行效果如何**"。
  > 由 engops-lead 在任务完成后同步写 analytics（不新增 Agent）；只分析不决策，Selection / Recommendation 留给下一阶段。
- **v0.6.9（新增）**：Model Routing **Feedback Loop** —— feedback-history / feedback-metrics / routing-feedback-analytics / improvement-proposal
  > 从"只推荐不执行"的 Model Recommendation 升级为"**Model Recommendation Intelligence**"：基于历史反馈沉淀『任务 ↔ 模型能力档位』适配知识。
  > 仍保持：**人工审核**（proposal 经 engops-lead 批准）、**策略可追踪**（change_log / 可回滚）、**不自动改变行为**。
  > 详见 `source/docs/model-routing-feedback-spec.md`。
- **v0.7（新增）**：Runtime **Integration Contract** —— 统一 Runtime Context 驱动的协作层
  > 从"多个 Agent Platform 能力模块各自独立工作"升级为"**统一 Runtime Context 驱动的平台**"：所有模块（Router / Team / Agent / Model Recommendation / Scheduler / Execution / Quality / Observability / Memory / Evolution）通过 **Runtime Contract** 协作。
  > 关键资产：`platform/runtime/runtime-contract.yaml`（模块归属矩阵 + 流转路径 + 硬性边界）、`runtime-context-schema.yaml`（台账字段白名单 + forbidden_fields）、`.ai/context/runtime/runtime-context.yaml`（集成台账）、`snapshots/`（快照，只读）。
  > 仍保持：**不自动执行 / 不自动调度 / 不自动切换模型 / 不自动 Agent Selection**；台账由 engops-lead 人工维护。
  > 详见 `source/docs/runtime-integration-contract-spec.md`。
- **v0.8（新增）**：Runtime **Action Proposal & Approval** —— 具体运行时动作的提案与审批治理层（Runtime Governance Layer）
  > 从"Runtime Context 记录模块状态"升级为"**可执行动作必须经 Action Proposal → Approval 才能进入 Execution Interface**"。
  > 关键资产：`platform/runtime-action/action-policy.yaml`（动作类型 / 风险分级 / 批准模型 / 硬性边界）、`action-proposal-schema.yaml`（提案字段白名单 + forbidden）、`records/AP-*.yaml`（提案记录）、`.ai/context/runtime-action/action-ledger.yaml`（Action 集成台账）、`snapshots/AS-*.yaml`（快照，只读）。
  > 仍保持：**不自动执行 / 不自动调度 / 不自动切换模型 / 不自动 Agent Selection / 不自动批准 / 不自动绕过**；Action Policy / Proposal / Ledger 由 engops-lead 人工维护。
  > 详见 `source/docs/runtime-action-proposal-spec.md`。
- **v0.9（新增）**：Runtime **Controlled Execution Interface** —— 受治理的执行接口层（Governed Agent Runtime 最后一层）
  > 从"Action 提案 / 批准"升级为"**将 Approved Action 转换为 Controlled Execution Request**"：只执行已批准动作，绑定 executor / permission / sandbox / rollback。
  > 关键资产：`platform/runtime-execution/execution-schema.yaml`（执行请求契约 + 6 不变量 + 状态机）、`executor-registry.yaml`（执行器能力）、`permission-policy.yaml`（风险→权限，含 critical）、`sandbox/`（隔离接口）、`rollback/`（复用 Recovery）、`.ai/context/runtime-execution/execution-ledger.yaml`（执行台账）+ `history/`。
  > 仍保持：**不实现真实执行引擎 / 不自动执行 / 不自动推进任务 / 不自动切换模型 / 不自动 Agent Selection / 不绕过 Approval**；执行台账 / 注册表 / 策略由 engops-lead 人工维护。
  > 详见 `source/docs/runtime-controlled-execution-spec.md`。
- **v1.0（新增）**：OpenCode **Runtime Adapter & Deployment Governance** —— Source→Runtime 受治理部署层
  > 从"直接改 runtime 的模糊边界"升级为"**MyTeam=Source of Truth，OpenCode=Runtime Deployment**，所有部署经 Package → Migration → Approval → Install"。
  > 关键资产：`platform/runtime-adapter/adapter-schema.yaml` + `opencode-adapter.yaml`（集成边界）+ `agent-binding.yaml`（30）/`mcp-binding.yaml`（5）/`skill-binding.yaml`（26）+ `deployment-manifest.yaml` + `migration-plan.yaml` + `rollback-plan.yaml`（复用 Recovery）+ `sync-state.yaml`（drift 只报告）+ `.ai/context/runtime-adapter/adapter-state.yaml`。
  > 仍保持：**禁止直接改 runtime / runtime 反向改 source / 自动安装 / 自动升级 / 自动覆盖 / 自动删除旧版本 / 自动运行任务**；drift 只报告不修复。
  > 详见 `source/docs/runtime-adapter-spec.md` · `source/docs/deployment-governance-spec.md`。
- **v1.0.1（新增）**：MyTeam **OpenCode Plugin Wrapper** —— 将 MyTeam 封装为 OpenCode Plugin（宿主隔离）
  > OpenCode=Host Runtime，MyTeam=Independent Plugin；`plugin/opencode/`（manifest / index.ts / loader.ts / bridge.ts / myteam-plugin.yaml）就地只读、`copy_files=false` / `reversible=true`。
  > 详见 `plugin/opencode/README.md`。
- **v1.1（新增）**：MyTeam **Plugin CLI & Developer Experience** —— 从 Plugin 升级为用户可管理的软件工具
  > `tools/myteam-cli/`（init / status / doctor / validate / upgrade / rollback）+ `plugin-state.yaml`（lifecycle：installed/loaded/healthy/degraded/disabled，record-only）。
  > 仍保持：CLI 只管理 状态/验证/迁移/回滚；不安装 / 不改 OpenCode / 不执行任务 / 不选 Agent / 不改 Prompt / 不调 Model Routing。
  > 详见 `source/docs/myteam-cli-spec.md` · `source/docs/developer-experience-spec.md`。
- **v1.2（新增）**：MyTeam **Controlled Execution Engine** —— 受治理执行引擎（Approved Action → Executor → Result）
  > `platform/execution-engine/`（engine-schema / execution-policy / executor-registry + executors(code/shell/mcp/test/browser) / permission / sandbox / queue / result）+ `.ai/context/execution-engine/`（engine-state / execution-results）+ `plugin/opencode/execution-bridge.ts`。
  > 三层分离：Context=状态 / Action=意图 / Execution=执行记录；Agent 不得直调 Executor。
  > 仍保持：只执行 approved action + granted permission；不自动执行 / 不自动选 executor / 不自动提权 / 不改 sandbox policy / 不改 Prompt / 不改 Model Routing；critical proposal-only；failed 连 Recovery。
  > 详见 `source/docs/execution-engine-spec.md` · `source/docs/executor-governance-spec.md`。
- **v1.3（新增）**：MyTeam **Project Workspace & Collaboration Layer** —— Agent Workspace Runtime（多 Agent 协作）
  > `platform/workspace/`（workspace-schema / policy / manager + agents / snapshots(checkpoint) / changes / merge / artifacts）+ `.ai/context/workspace/`（workspace-state / changes / snapshots / merge-requests / artifact-links / agent-bindings）。
  > 链路：Agent → Workspace → Change Tracking → Review → Quality Gate → Merge → Artifact。
  > 四层分离：Workspace≠Execution≠Memory≠Artifact；仍保持：禁止自动 merge / Agent 绕过 workspace / 改他人 workspace / 自动删 checkpoint / 自动改权限 / 自动覆盖。
  > 详见 `source/docs/workspace-layer-spec.md` · `source/docs/multi-agent-collaboration-spec.md`。
- **v1.4（新增）**：MyTeam **Agent Collaboration Protocol Layer** —— Agent 间通信与协作协议
  > `platform/collaboration/`（collaboration/message/handoff/decision/conflict schema + policies）+ `.ai/context/collaboration/`（collaboration-state / messages / handoffs / decisions / conflicts）。
  > 链路：Agent → Message → Handoff → Decision → Resolution → Execution。
  > 四层边界：Collaboration≠Memory≠Workspace≠Execution；仍保持：只产生 request/decision/handoff（不直接 Execution）、禁止 Agent 自动调 Agent / 自动解决冲突 / 自动改任务目标 / 自动改 Prompt。
  > 详见 `source/docs/collaboration-protocol-spec.md` · `source/docs/agent-handoff-spec.md`。
- **v1.4.1（新增）**：MyTeam **Debug & Trace Mode Layer** —— 一次任务全生命周期可追踪
  > `platform/debug-trace/`（trace/event/policy schema + collectors(router/collaboration/workspace/execution/quality) + storage/queries/reports）+ `.ai/context/debug-trace/`（trace-index + events）。
  > 链路（12 层）：router→team→agent→collaboration→workspace→action→approval→execution→quality→artifact→memory→evolution。
  > 仍保持：Trace 只记录 pointer + 查询 / 展示 / 审计；不执行 / 不修复 / 不调度 / 不改状态；Trace ≠ Memory ≠ Observability ≠ Collaboration ≠ Execution Ledger。
  > 详见 `source/docs/debug-trace-spec.md` · `source/docs/task-lifecycle-trace-spec.md`。
- **v1.4.2（新增）**：MyTeam **Runtime Safety & Production Guard Layer** —— 生产安全治理（资源/成本/超时/循环/人工确认）
  > `platform/runtime-safety/`（safety-policy / risk-schema + budget(token/cost) + limits(execution/retry/loop/concurrency) + timeout + escalation + integrations(trace/execution/action)）+ `.ai/context/runtime-safety/`（safety-state / escalations）。
  > safe-by-default；状态 normal/warning/blocked/waiting-human；Execution Engine 执行前读 safety status；critical→human_required；trace 扩展 13 层(+safety)。
  > 仍保持：Safety 只检测/限制/阻断/升级人工确认；不执行/不批准；禁止自动提权/扩预算/改策略/跳过人工确认；Safety ≠ Approval ≠ Execution Engine。
  > 详见 `source/docs/runtime-safety-spec.md` · `source/docs/production-guard-spec.md`。

## 0.1 目录结构（v1.1 + v0.3.2 ~ v1.4.2）
```
.ai/context/
├── current-task.yaml            # 当前任务信息层（v1.0）
├── teams/{team}/team-context.md # Team 级上下文（v1.1）
├── shared/                      # 跨 Team 共享（v1.1）
├── runtime/                     # 运行状态层（v0.3.2）+ Runtime Context 集成台账（v0.7）
│   ├── execution-state.yaml
│   ├── queue/pending-steps.yaml
│   ├── errors/{task_id}-{step}.log
│   ├── runtime-context.yaml     # v0.7 集成台账（模块协作统一运行时上下文）
│   └── snapshots/RC-SNAP-*.yaml # v0.7 快照（只读，contract_version 变化时留底）
├── runtime-action/              # Action Governance 层（v0.8）
│   ├── action-ledger.yaml       # v0.8 Action 集成台账（提案/批准状态）
│   └── snapshots/AS-*.yaml      # v0.8 快照（只读，ledger.version 变化时留底）
├── runtime-execution/           # Controlled Execution 层（v0.9）
│   ├── execution-ledger.yaml    # v0.9 执行集成台账（只增，审计）
│   ├── history/EX-*-history.yaml # v0.9 执行历史 + execution metrics
│   ├── rollback/RB-*.yaml       # v0.9 回滚记录（复用 Recovery checkpoint）
│   └── sandbox/SB-*.yaml        # v0.9 沙箱隔离声明（接口，未真实隔离）
├── runtime-adapter/             # Deployment Governance 层（v1.0）
│   └── adapter-state.yaml       # v1.0 部署适配器状态镜像（权威在 platform/runtime-adapter/）
├── recovery/                    # 恢复层（v0.3.3）
│   ├── recovery-state.yaml
│   ├── strategy-registry.yaml
│   └── checkpoints/{task_id}-checkpoint.yaml
├── scheduler/                   # 调度层（v0.4 + v0.4.1）
│   ├── scheduler-state.yaml     # 调度状态
│   ├── dependency-resolver.yaml # 依赖解析
│   ├── execution-plan.yaml      # 执行建议
│   ├── policies/                # resource / priority / risk
│   ├── runtime-state.yaml       # v0.4.1 决策对应 step 运行态
│   ├── approval-queue.yaml      # v0.4.1 待批准队列（高风险强制）
│   ├── decision-log/            # v0.4.1 决策记录（只增）
│   └── feedback/                # v0.4.1 执行反馈（只增）
├── memory/                      # 工作记忆层（v0.4.2）
│   ├── task-memory.yaml         # 目标/进度/决策/下一步
│   └── archive/                 # 任务完成归档
├── quality/                     # 质量闸口层（v0.4.3）
│   ├── gate-state.yaml          # Gate 总状态（唯一写入口）
│   └── gates/                   # validation / review / acceptance 记录（只增）
├── observability/               # 运行观测层（v0.4.4）
│   ├── history/{task}-history.yaml   # execution-history（只增）
│   ├── failures/{task}-failures.yaml# failure-analysis（只增）
│   ├── metrics/task-metrics.yaml     # 任务度量
│   ├── metrics/quality-metrics.yaml  # 跨任务质量趋势
│   └── health-report/health-report.yaml
├── capability/                  # 能力索引层（v0.5）
│   ├── agent-capabilities.yaml  # 30 Agent 能力
│   ├── skill-registry.yaml      # 26 Skill 能力
│   ├── mcp-registry.yaml        # 5 MCP 能力
│   ├── capability-feedback.yaml # 能力反馈（只增，来自 Observability）
│   └── tests/                   # 5 个测试 case
├── analytics/                   # 能力分析层（v0.5.1）
│   ├── metrics/capability-metrics.yaml   # 能力级指标（usage/failure/quality_pass_rate）
│   ├── metrics/agent-performance.yaml    # Agent 性能（实际 vs 声明）
│   ├── trends/capability-trend.yaml      # 能力趋势（连续任务）
│   ├── reports/analytics-report.yaml     # Analytics 报告（只建议不执行）
│   └── agents/{agent}-analytics.yaml     # 单 Agent 分析
└── templates/
```

## 0.2 四层模型
| 层 | 文件 | 回答 |
|----|------|------|
| 信息层 | current-task / task-plan | 任务是什么、计划怎么拆 |
| 运行层 | runtime/ | 现在运行到哪、谁在跑 |
| **恢复层** | **recovery/** | **失败后怎么恢复、从哪继续** |
| 共享层 | shared/ teams/ | 跨 Team 协作现场 |

详见 `docs/recovery-spec.md`

## 1. Context 定义

Context = **当前任务状态层**，回答"现在做到哪了、谁在做、下一步做什么"。

载体：`.ai/context/current-task.yaml`

```yaml
version: 1
task_id: "refund-feature"
status: in-progress          # planning/in-progress/paused/blocked/review/done/failed
requirements: { goal, scope_in, scope_out, acceptance, open_questions }
assignment: { department, lead, workflow, parallel_tracks }
task_plan: ".ai/tasks/refund-feature/task-plan.yaml"
artifacts: { architecture, code, review }
handoff_log: [ {time, from, to, note, status} ]
resume_point: { step, instruction }
```

## 2. 与 Knowledge 的区别

| | Context | Knowledge |
|--|---------|-----------|
| 内容 | 单个进行中任务的状态 / 指针 / 交接 | 稳定项目事实（架构 / 约定 / 决策 / 坑） |
| 生命周期 | 任务结束归档 | 长期跨任务 |
| 写者 | PM 创建，Lead/Agent 更新 | knowledge 部门 Agent |
| 例 | "step-3 进行中，交给 reviewer" | "项目用 MyBatis-Plus" |

任务结束后：结论提炼进 Knowledge，Context 归档，不留僵尸任务。

## 3. Memory 未来边界

- **Memory = 跨会话元信息**（用户偏好、部门历史表现、长期行为模式），由 MCP `memory` 承担
- 本阶段**不新增 Memory**；未来 Memory 负责"记"，Context 负责"当前态"，Knowledge 负责"事实"
- 三者的分工避免上下文互相污染：Context 不沉淀长期知识，Knowledge 不存瞬时状态

## 4. Artifact 规范

- 目录：`.ai/artifacts/{category}/{task_id}/`
- 分类：architecture / code / review / research / creative / engops
- 命名：`{task_id}-{类别}-{序号}.md`（只追加不覆盖，保留过程）
- 规则：
  1. 产出即落盘，头部含元数据注释（task_id / agent / version / created_at）
  2. 交接只传指针（`current-task.yaml` 登记），不复制内容进聊天
  3. 输入必读：Agent 开工先读自己 `inputs` 指向的 artifact
- 详见 `docs/artifact-spec.md`

## 4.1 Team Context（v1.1 新增）

Team 级上下文：`teams/{team}/team-context.md`，跨任务共享该 Team 的工作现场。

**任务（task）与 Team（team）双维度**：
```
任务维度：.ai/context/current-task.yaml      ← 单个任务状态
Team 维度：.ai/context/teams/{team}/…        ← 某 Team 的共享现场
共享维度：.ai/context/shared/…               ← 跨 Team
```

写者：
- `teams/{team}/team-context.md` 由对应 **Lead** 维护（任务开始/结束时更新"团队当前焦点"）
- `shared/knowledge/knowledge-summary.md` 由 **PM** 生成（分派前）
- `shared/handoff/` 由交接双方 Lead 追加

隔离规则：
- 各 Team 只读 `teams/{self}/` + `shared/`，**不读写**其他 Team 目录
- 跨 Team 协作必须经 `shared/handoff/`（写交接记录）

## 5. Task Plan 规范

- 文件：`.ai/tasks/{task_id}/task-plan.yaml`（Lead 编写）
- 核心：`steps[]`（id / name / agent / depends_on / inputs / outputs / status / parallel_group）
- 规则：
  1. 一个 Agent 一次调用 = 一个 step
  2. `depends_on` 决定串行顺序；`parallel_group` 相同可并行
  3. 依赖未 done 不得进入 in-progress（禁止跳步）
  4. 暂停用 `resume_point`，恢复从该 step 重入
- 详见 `docs/task-plan-spec.md`

## 6. Agent 交接规范

交接 = 更新 `current-task.yaml` 的 `handoff_log` + 登记 `artifacts` 指针。

```
java-lead ──(追加 handoff_log)──> java-architect
  "step-1 开工，输入 requirements"
java-architect ──(产出 architecture artifact)──> java-lead
java-lead ──(handoff_log: 架构已产出，交 planner)──> java-planner
```

- 禁止：在聊天中传递大段上下文；靠记忆猜上一个 Agent 做了什么
- 每个交接必须有：from / to / note / status / 产物指针

## 6.1 Knowledge Integration（v1.1 新增）

Context 与 Knowledge 的连接，通过 **PM 生成的 `shared/knowledge/knowledge-summary.md`** 桥接。

流程：
```
任务开始 → PM 读 .ai/knowledge/ → 提炼知识摘要 → shared/knowledge/knowledge-summary.md
各 Team Lead 开工 → 读 knowledge-summary.md + 自己 teams/{team}/team-context.md
执行中需要细节 → 按需查 .ai/knowledge/ 原文（只读）
任务结束 → 结论沉淀回 Knowledge（经 Knowledge Team）
```

规则：
- 摘要只提炼**与当前任务相关**的知识，不整库复制
- 各 Team 不直接改 `.ai/knowledge/`（写入走 Knowledge Team：project-knowledge-manager / adr-recorder）
- 摘要含来源标注（knowledge 文件路径），Agent 需要细节时追溯原文

## 7. 恢复任务方式

1. **暂停**：PM 或 Lead 置 `status: paused` + 写 `resume_point.step` 与 `instruction`
2. **继续**：读取 `current-task.yaml` → `resume_point.step` → 从 `task-plan.yaml` 对应 step 重入
3. 重入方读取该 step 的 `inputs`（artifact / 知识）恢复工作现场
4. **崩溃恢复**：任何 Agent 从 `handoff_log` 最后一条判断中断点，从其后继续
5. **并行恢复**：每个并行 track 独立 context，恢复互不干扰

## 快速上手

```bash
# 任务开始
@project-manager-agent：给订单系统增加退款功能
# PM 创建 current-task.yaml → 生成 knowledge-summary.md → 交 java-lead
# java-lead 写 task-plan.yaml → 维护 runtime/execution-state.yaml → 依次/并行调子 Agent
# 暂停/继续
PM：暂停任务   → current-task.yaml status=paused + resume_point
PM：继续任务   → 读 resume_point 重入
# 运行状态（v0.3.2）
Lead：分派 step  → execution-state.yaml agent_status=running
Agent：完成      → step=completed + output
Agent：失败      → step=failed + runtime/errors/{task_id}-{step}.log
# 失败恢复（v0.3.3）
Lead：读 errors/ + strategy-registry → 选策略 → 更新 recovery-state.yaml
debugger：编译失败 → 定位根因 → 重试
MCP 超时：记录 retry → 指数退避重试
权限不足：waiting_user → 上报 PM 等用户授权
对话中断：resume_point 重入
```
