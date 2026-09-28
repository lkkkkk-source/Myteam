# quick-fix（快速修复）

## 使用场景
- Bug 修复（有明确现象/日志的已知问题）
- 配置修改（yml / properties / 常量调整）
- 小范围代码调整（1~3 个文件、单模块、无跨模块影响）

## 输入
- 问题描述（现象、复现步骤、报错信息、相关文件路径）

## 调用 Agent 顺序
> **入口：`java-lead` 负责按本流程编排**（PM 分派任务到 java-lead，小修复 Lead 可跳过 architect/planner 直接走 debugger→developer→tester）。

1. **java-debugger** — 读日志/异常栈、定位根因、给出修复方案
   - 若根因已明确（配置项、错别字、小缺陷），**跳过** java-debugger，直接进入 developer
2. **java-developer** — 按方案实施最小修改（TDD：先补一个回归用例再修）
3. **java-tester** — 运行相关测试，确认修复且无回归

## 跳过规则
- 根因明确且修复 < 3 文件：跳过 java-debugger
- 无跨模块、无并发、无 SQL 变更：跳过 java-reviewer（不在此 workflow 中）
- 单文件小改：java-tester 仅跑相关单测即可

## 输出要求
- 问题原因（根因 + 证据链）
- 修改内容（diff 摘要 / 影响文件清单）
- 验证结果（测试命令 + 结果）

## 结束条件
- 相关测试通过
- 无回归用例失败
- 修改范围最小化（不引入无关重构）

## 不适用
- 跨模块架构问题 → 用 `feature-development`
- 性能瓶颈复杂归因 → 单独调用 java-architect 分析后走 `refactor`