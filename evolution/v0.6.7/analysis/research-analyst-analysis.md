# research-analyst 跨 Team 升级分析（v0.6.7）

> 外部研究：外部库 `external/agency-agents/` 中具"基于证据 / 保持怀疑 / 可追溯结论"特性的 Agent，
> 印证「结论必须带证据」是可泛化的 Agent 质量模式，与 java 链 BM-066-01 实证一致。

## 1. 目标 Agent
- **research-analyst**（research team，科研前沿分析 Agent）
- v1 现状：输出前沿分析报告 + 方向建议，但 Guardrails 仅一句话"每个结论必须有文献依据或明确标注为推测"，缺乏结构化证据字段与反遗漏约束。
- 与 v0.6.5 java-developer / v0.6.6 Java 链的差距点同源：**论断无结构化证据、无反遗漏清单、无优先级分级**。

## 2. 外部参考（evidence-based 通用性）
外部库中具证据/怀疑特性的 Agent 例：
- `evidence-checker` / `fact-verifier` 类：每个论断绑定来源引用。
- `devil's-advocate` / `reality-checker` 类：对论断主动找反例，防过度乐观。
- 结论：**证据化结论**不是 Java 特有，而是所有输出"判定/建议"的 Agent 的通性模式 → 可跨 Team 复用。

## 3. 复用来源
- Pattern **PATTERN-001 evidence-based-output**，origin=java-developer v2（v0.6.5），
  经 java-architect/reviewer/tester（v0.6.6）同源验证，平均质量提升 +4/+5/+6。
- 本次把同一 Pattern 转写为 research-analyst 协议（不复制外部内容，不复制 Java 细节）。

## 4. 提取的要素（转写为 research 域）
- Evidence field：趋势/空白/方向建议必须附「文献/数据/方法来源引用」；无来源 → 标注推测。
- 反遗漏 bias：多源观点覆盖清单（遵循 PATTERN-002 思想，但本阶段以证据化复用为主）。
- 反幻想：无证据的"方向很热/值得做"默认低置信或不采信（PATTERN-003 思想）。
- 优先级分级：方向建议按证据强度分级（Strong hypothesis / Candidate / Speculative）。

## 5. 不改
- Agent 数量、MCP、Skill、Workflow、Runtime 全部不变。
- 纯加法：保留 research-analyst 既有 Role/Responsibility/Workflow 全部系统协议。
