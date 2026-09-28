# Comparison — MyTeam vs agency-agents (v0.6.3)

> 对比结果。只记录差异与差距，本阶段不做任何 prompt 修改。

## 1. 规模对比
| 项 | MyTeam | agency-agents | 说明 |
|----|--------|---------------|------|
| Agent 数 | 30 | 264 | 内部为组织级平台，外部为能力库 |
| 平台层 | PM/Router + 4 Leads + Teams | 无集中编排（app 侧做安装） | 内部架构领先 |
| Context 协议 | `.ai/context/**` 集中 | 无 | 内部领先 |
| Memory 协议 | task-memory-agent 集中 | 各 agent 内嵌 | 内部领先 |
| Quality Gate | engops 系统层观测 | 内嵌 Critical Rules | 外部更"清单化" |
| Skill 复用 | 26 Skills | tools.json（安装到各 CLI） | 内部通过 CC Switch |
| MCP | 5 | 无（靠工具安装） | 内部领先 |

## 2. 能力覆盖矩阵（内部 30 vs 外部相关 division）
| 能力域 | 内部 Agent | 外部对应 division | 覆盖率 | 差距 |
|--------|-----------|-------------------|--------|------|
| Java 开发 | java-developer / java-architect / java-planner | engineering (54) | 高 | 专业深度：外部 architect 有 ADR 模板与 trade-off 规则 |
| 代码评审 | java-reviewer | engineering-code-reviewer | 高 | 验收清单机械化程度外部更高 |
| 测试 | java-tester | testing (9) | 中 | 外部细分 API/性能/可访问/证据，内部单 agent 覆盖多维度 |
| 研究 | literature / analyst / experiment / innovation / paper-writer | academic (6) + engineering 部分 | 高 | 统计实验方法外部更专业 |
| 创作 | writing / resume / ppt / editor | design (9) + specialized 部分 | 中 | 视觉/UX 外部更细分 |
| 运维 | git-manager / changelog / release / health | engineering-devops / git-workflow | 高 | 外部有 runbook 更流水线化 |
| 知识 | adr-recorder / project-knowledge-manager | 无直接 | 高 | 内部独立，无外部对标 |
| 安全 | (无专门) | security (12) | 低 | 内部缺安全评审维度（不新增 agent，作为质量参考） |

## 3. 协议差距总结
| 协议 | MyTeam 状态 | 外部参考 | 建议 |
|------|-------------|----------|------|
| **Professional 能力** | 角色+职责+Workflow 完整 | Critical Rules / ADR 模板 / 细分专业 | 渐进吸收外部专业清单到现有 agent 的 Guardrails / 参考材料 |
| **Context 协议** | `.ai/context/**` 领先 | 无 | 保持；强化 platform-state 消费 |
| **Memory 协议** | task-memory.yaml 集中 | 内嵌 memory 字段 | 保持集中式 |
| **Quality 协议** | Quality Gate 系统层 | 验收清单 + 证据化输出 | 借鉴"验收清单 + 证据引用"格式增强 reviewer/tester/health |

## 4. 差距优先级
| 优先级 | 差距 | 收益 | 成本 |
|--------|------|------|------|
| P1 | reviewer/tester 补验收清单与证据化输出 | 直接提升代码质量闭环 | 低（只改 2 个 agent 的 Guardrails/Output） |
| P2 | architect/solution-architect 补 ADR 模板参考 | 提升架构决策可追溯 | 低 |
| P3 | 安全评审清单进入 health/reviewer | 降低安全风险 | 低 |
| P4 | 研究 agent 参考统计实验方法 | 提升研究严谨性 | 中 |
| P5 | 其余 (no-internal 域) | — | 高，MyTeam 基线不覆盖 |

## 5. 结论
- 内部平台协议（Context/Memory/Quality 体系）整体**领先**于外部。
- 外部最大价值 = 专业能力深度的**现成参考**（ADR 模板 / critical rules / 验收清单 / 证据化输出）。
- 演进策略：**协议借鉴而非 agent 复制**。保持 30 Agent 基线，把外部最佳实践吸收为内部 agent 的质量基线。
