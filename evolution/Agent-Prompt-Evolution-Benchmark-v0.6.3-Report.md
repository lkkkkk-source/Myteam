# Agent Prompt Evolution Benchmark v0.6.3 Report

## 1. External Repository 信息

| 项目 | 结果 |
|------|------|
| Repository | `agency-agents` |
| Source | `https://github.com/lkkkkk-source/agency-agents.git` |
| Clone path | `external/agency-agents/` |
| License | MIT |
| Head | `459dce8` — Add GaussDB Expert Engineer specialist |
| Agent Prompt（frontmatter name） | 264 |
| Markdown 文件总数 | 276（仓库目录递归扫描结果） |
| 主要相关分区 | engineering 54 / specialized 56 / testing 9 / project-management 7 / security 12 |
| 研究定位 | 外部 Agent Prompt 研究库，只读参考 |

外部仓库未合并到 `source/`，未安装到 OpenCode Runtime。

## 2. Agent Mapping

已生成：`evolution/analysis/agent-mapping.yaml`

映射策略是“能力域映射”，不是复制外部 Agent：

- `matched`：外部能力与内部 Agent 高度重合
- `partial`：部分能力可参考
- `no-internal`：内部基线没有对应域，仅记录，不新增 Agent

重点映射：

| 外部能力 | 内部 Agent | 结论 |
|----------|------------|------|
| software-architect / backend-architect | `java/java-architect` | 架构、ADR、trade-off 可借鉴 |
| senior-developer | `java/java-developer` | 专业开发实践可借鉴 |
| code-reviewer | `java/java-reviewer` | 评审清单与证据化输出可借鉴 |
| API/test automation | `java/java-tester` | API、自动化、性能测试维度可借鉴 |
| project-manager-senior | `pm/project-manager-agent` | 里程碑、风险、收口可借鉴 |
| git-workflow-master | `engops/git-manager` | Git 工作流规范可借鉴 |
| academic-statistician | `research/research-analyst` | 统计实验方法可借鉴 |
| technical-writer | `creative/writing-agent` / `research/paper-writer` | 技术写作结构可借鉴 |
| security-appsec-engineer | `java/java-reviewer` / `project-health-agent` | 安全质量清单可借鉴 |

## 3. Prompt Audit 结果

已生成：`evolution/analysis/prompt-audit.md`

### 内部优势

- 集中式 Context 协议：`.ai/context/**`
- 集中式 Memory 协议：`task-memory-agent` 与 `task-memory.yaml`
- Project Manager / Router / Lead / Team 组织架构
- MCP=5、Skill=26、Quality Gate、Recovery、Observability 等平台能力
- Source / Build / Runtime / Migration / Rollback 分层

### 外部优势

- 专业角色细分更深
- `Critical Rules` 更清晰
- ADR、测试、代码评审、安全审计清单更完整
- Deliverable-focused 与证据化输出更明确
- Frontmatter 元数据更适合目录化研究

## 4. Comparison 结果

已生成：`evolution/analysis/comparison.md`

核心结论：

- MyTeam 不是外部 Agent 的简单集合，而是具备集中编排与生命周期治理的平台。
- MyTeam 在 Context、Memory、MCP、Quality Gate、Source/Runtime Separation 上领先。
- agency-agents 在专业能力深度、验收清单、证据化输出方面更适合作为研究样本。
- 正确演进方向是“协议借鉴”，不是增加 Agent 数量。

协议对比：

| 协议 | v0.6.3 结论 |
|------|-------------|
| Professional | 吸收 ADR、trade-off、测试、安全与检索专业清单 |
| Context | 保持 MyTeam 集中式 Context，不引入外部分散上下文 |
| Memory | 保持 task-memory 单一来源，不复制外部记忆字段 |
| Quality | 增强验收清单、证据引用、质量门禁联动 |

## 5. Upgrade Proposal 列表

已生成：`evolution/proposals/upgrade-proposals.yaml`

提案按四类组织：

- **Professional**：P-01 至 P-07
- **Context**：C-01 至 C-03
- **Memory**：M-01
- **Quality**：Q-01 至 Q-04

当前全部状态为 `proposed`，未自动执行。

优先级：

1. `java-reviewer` / `java-tester` 增加验收清单与证据化输出
2. `java-architect` / `solution-architect` 增加 ADR 与 trade-off 参考
3. `project-health-agent` / `java-reviewer` 增加安全质量维度
4. `research-analyst` / `experiment-agent` 增加统计实验方法
5. `literature-agent` 增加检索相关性与来源溯源

## 6. Agent 修改记录

只修改以下 3 个 Source Prompt：

| Agent | 修改内容 |
|-------|----------|
| `pm/project-manager-agent` | 识别 Prompt Evolution、外部研究库与提案流程；禁止自动合并/替换/安装 |
| `leads/engops-lead` | 负责 evolution build 流程、提案评审、测试、Build → 手动 Install |
| `engops/project-health-agent` | 检查 evolution 目录、外部研究库只读状态、提案与 Source Prompt 一致性 |

未新增 Agent，未删除 Agent，未修改其他 Agent Prompt。

## 7. 测试结果

测试脚本：`evolution/tests/run-evolution-tests.ps1`

| Case | 检查内容 | 结果 |
|------|----------|------|
| Case1 | external source 记录、仓库元数据、Agent 数量 | PASS |
| Case2 | external role → internal Agent mapping | PASS |
| Case3 | Prompt Audit 与 Comparison 生成 | PASS |
| Case4 | Upgrade Proposal 生成且不自动修改 Prompt | PASS |
| Case5 | 基线、Source 隔离、Runtime 未触碰 | PASS |

**TOTAL: 5 / 5 passed**

## 8. 基线确认

| 基线项 | 要求 | 结果 |
|--------|------|------|
| Agent | 30 | PASS |
| MCP | 5 | PASS |
| Skill | 26 | PASS |
| Workflow | 8 | PASS |
| 自动合并 | 禁止 | 未执行 |
| 自动替换 | 禁止 | 未执行 |
| 自动安装 | 禁止 | 未执行 |
| Runtime 修改 | 禁止 | 未执行 |

## 9. 交付目录

```text
evolution/
├── metadata/external-repo.yaml
├── analysis/agent-mapping.yaml
├── analysis/prompt-audit.md
├── analysis/comparison.md
├── proposals/upgrade-proposals.yaml
├── tests/README.md
├── tests/run-evolution-tests.ps1
└── Agent-Prompt-Evolution-Benchmark-v0.6.3-Report.md
```

## Final Decision

`agency-agents` 已纳入 MyTeam 的外部 Agent Prompt 研究库。当前只完成记录、映射、审计、对比和提案生成；未执行自动合并、自动替换、自动安装或 Agent 数量变更。