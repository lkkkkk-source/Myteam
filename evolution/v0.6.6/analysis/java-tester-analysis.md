# java-tester v2 — Analysis (v0.6.6)

agent: java-tester
from_version: v1
to_version: v2
phase: v0.6.6 / Agent Evolution Scale

## 审计结论（复用 v0.6.3 benchmark 差距）
- v1 有"未实际执行不得声称通过"的正确约束，但**缺"证据收集"密度**：报告常只有结论，不着证据（命令输出 / 用例 / 覆盖率）。
- v1 未区分「测试写错」与「实现有 bug」的判定证据链，容易把实现缺陷误归因到测试。
- v1 无**覆盖率 / 边界分支**的量化视角，验证"是否测试过失败路径"依赖自觉。

## 外部研究（external/agency-agents 只读参考，不复制）
- `testing-reality-checker.md`：反幻想批准、证据优先、默认不通过 —— tester 是 validation Gate 最后防线。
- `testing-test-results-analyzer.md`：把测试结果当证据读，统计驱动、根因分析。

## 提炼（转写为本平台协议，非复制）
1. **证据收集（evidence-first output）**：报告必须附真实命令输出/用例/异常栈/覆盖率。
2. **根因归属证据链**：区分"测试写错 vs 实现有 bug"要给出判断依据，不臆断。
3. **反幻想（default-to-failed 偏差）**：无证据的"应该能过"一律不采信，必须看到实际运行结果。

## 风险
- 纯加法，无删除；不改变 tester 的 validation Gate 职责。
- 不引入自动测试框架；仍以命令执行为主。

## 决策
升级为 v2（additive）。
