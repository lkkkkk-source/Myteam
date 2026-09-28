# Prompt Audit — 内部 Agent Prompt 与外部生态对比

> 只读审计，修改不在此阶段（Proposal 阶段不触碰 prompt）。

## 审计对象
- 内部：`source/prompts/**/*.md`（30 Agents）
- 外部：`external/agency-agents/`（264 Agents，9 大相关 division）

## 对比维度
| 维度 | 内部 MyTeam 现状 | 外部 agency-agents 现状 | 差距 |
|------|-----------------|------------------------|------|
| 角色定义 | Role + Responsibility 明确 | name+description+color+emoji+vibe 元数据化 | 外部元数据更结构化，可机器消费 |
| 工作流 | Workflow 步骤化（5 步内） | 步骤化 + playbook/runbook 分类 | 内部已够用；外部偏流水线 |
| 记忆协议 | `.ai/context/memory/task-memory.yaml` + task-memory-agent | Memory 分散在各 agent 自身 identity/memory 字段 | 内部有集中协议，优于外部 |
| Context 协议 | `.ai/context/**`（memory / router / scheduler / recovery / platform） | 各 agent 独立，无集中 Context | 内部有平台级 Context，结构更完整 |
| 质量门禁 | Quality Gate 系统层（engops-lead 观测） | Critical Rules / 验收清单嵌入 agent | 外部在**评审清单/验收标准规范化**上更细 |
| 输出规范 | Output Format 每 agent 有 | Deliverable-Focused + 证据化输出 | 外部输出证据化（引用/指标/验收）可借鉴 |
| 安全 | 少 explicit 安全清单 | security division 12 个专业 agent 有成熟安全评审模式 | 安全评审清单可从外部移植参考 |
| ADR | adr-recorder 维护 ADR | Architecture Decision Record Template 嵌入 java architect | 外部有现成 ADR 模板结构可参考 |
| 测试 | java-tester 覆盖功能/自动化 | 9 类测试 agent（API/性能/可访问性/结果分析） | 测试专业化维度多于内部 |

## 主要发现
1. **专业能力提升点**：外部 engineering/software-architect 的 ADR 模板、critical rules（no architecture astronautics / trade-off over best practice / reversibility）值得内部 java-architect / solution-architect 参考。
2. **质量协议提升点**：外部 code-reviewer、testing 系列有成熟的验收清单与证据化输出，内部 reviewer/tester 可借鉴"验收清单 + 证据引用"格式。
3. **Context 协议**：内部已领先（集中式 `.ai/context`），应保持并强化 platform-state 消费。
4. **Memory 协议**：内部 task-memory 集中协议优于外部分散记忆；继续保持。
5. **安全维度**：内部缺显式安全评审清单，外部 security division 可作参考模板（不新增 agent）。
6. **输出规范化**：外部每个 agent 强调"可交付产出 + 证据"，内部多数已有 Output Format，可补强证据化字段。

## 待采纳参考池（仅记录，不改 prompt）
| 参考项 | 来源外部 | 提议去向 | 类型 |
|--------|----------|----------|------|
| ADR 模板结构 | engineering-software-architect | adr-recorder / java-architect | Professional |
| Critical Rules 清单 | engineering-software-architect | java-architect / solution-architect | Professional |
| 评审验收清单 | engineering-code-reviewer | java-reviewer | Quality |
| 测试证据化输出 | testing-evidence-collector | java-tester | Quality |
| API 测试边界清单 | testing-api-tester | java-tester | Professional |
| 安全评审清单 | security-appsec-engineer | java-reviewer / project-health-agent | Quality |
| Git 规范清单 | engineering-git-workflow-master | git-manager | Professional |
| 实现最小改动原则 | engineering-minimal-change-engineer | java-developer | Quality |
| 里程碑式输出规范 | project-manager-senior | project-manager-agent | Context |
| 工作流收口清单 | project-management-project-shepherd | project-manager-agent | Context |
| 统计实验方法 | academic-statistician | research-analyst / experiment-agent | Professional |
| RAG 检索结构 | engineering-rag-pipeline-engineer | literature-agent | Professional |

## 审计结论
- 内部平台在 **Context 协议 / 平台架构 / 集中记忆** 上优于外部。
- 外部在 **专业细分深度 / 评审与验收清单的机械化 / 证据化输出规范** 上值得借鉴。
- 演进引擎建议：以"能力协议（Professional / Context / Memory / Quality）"为维度，渐进吸收外部最佳实践为内部 Agent 的质量基线，而非增加 Agent 数量。