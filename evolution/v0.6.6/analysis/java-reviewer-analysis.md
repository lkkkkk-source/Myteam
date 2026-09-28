# java-reviewer v2 — Analysis (v0.6.6)

agent: java-reviewer
from_version: v1
to_version: v2
phase: v0.6.6 / Agent Evolution Scale

## 审计结论（复用 v0.6.3 benchmark 差距）
- v1 审查维度完整，但**输出缺严重性排序驱动**的整合收敛（Top3-5 已有，但缺"证据 vs 断言"与"误报自检"）。
- v1 没有 Default-to-issue / evidence-first 的对抗偏差：容易只报顺手的、漏报跨文件真实问题。
- v1 未区分「必须修的 Blocker/Major」与「可放行的 Minor/Style」，缺乏放行优先级。

## 外部研究（external/agency-agents 只读参考，不复制）
- `engineering-code-reviewer.md`：结构化审查、严重性分级。
- `testing-reality-checker.md`：证据优先、默认不通过、反幻想批准 —— 防误报与漏报的核心精神。
- `testing-test-results-analyzer.md`：把证据当侦探读，结论必须有依据，统计驱动。

## 提炼（转写为本平台协议，非复制）
1. **证据优先（evidence-first）**：每条 Issue 必须带文件:行 + 判断依据；无法定位则不报或标"建议核实"（v1 有，v2 强化）。
2. **默认检查、反遗漏 bias**：审查启动即系统性走全维度，不因"看起来没问题"跳过任何维度。
3. **放行优先级（severity-gated）**：Blocker/Major 必须修；Minor/Style 标注可放行，避免新版过度阻塞。
4. **误报自检**：每条 Issue 标置信度 / 证据类型，防止 Reviewer 反向误导。

## 风险
- 纯加法，无删除；保持"只提问题不改代码"。
- 不放大 Block 面（非所有 Minor 都强制返工）。

## 决策
升级为 v2（additive）。
