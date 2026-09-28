# refactor（代码重构）

## 使用场景
- 代码整理（不改变外部行为）
- 性能优化
- 架构调整（跨模块的重新组织）

## 输入
- 重构目标（如：降低耦合、提取公共模块、优化 SQL、升级包结构）
- 约束（不能改动的 API / 行为契约）

## 调用 Agent 顺序
> **入口：`java-lead` 负责按本流程编排**（PM 分派任务到 java-lead，Lead 协调以下 Agent 依次执行）。

1. **java-architect** — 分析当前架构、识别痛点、设计目标架构
   - 输出：现状 vs 目标对比、迁移路径
2. **java-planner** — 拆解为小步可验证任务（每步保证可编译、行为不变）
3. **java-developer** — 按步执行重构（每步补/改测试锁住行为）
4. **java-reviewer** — 审查重构质量（是否有行为变化、是否引入隐患）
5. **java-tester** — 全量回归测试（重点是行为不变性）
6. **java-lead** — 汇总重构结果回报 PM

## 迭代规则
- Reviewer 发现行为偏差 → Developer 回退该步修复 → 复测
- 回归测试失败 → Debugger 定位根因 → Developer 修复

## 跳过规则
- 纯性能调优（单点、不影响架构）：跳过 java-architect
- 已有清晰目标架构：java-architect 只做确认而非设计
- 小范围整理（< 5 文件）：跳过 java-planner

## 输出要求
- 架构分析（痛点 + 目标 + 迁移路径）
- 分步任务清单（每步含验证标准）
- 代码改动 diff
- 回归测试报告
- 行为不变性确认（旧测试全绿）

## 结束条件
- 所有旧测试仍通过（行为不变）
- Reviewer 无 Major 以上问题
- 目标指标达成（如：代码行数、循环深度、SQL 次数）

## 不适用
- 纯 bug 修复 → 用 `quick-fix`
- 新增功能而非重构 → 用 `feature-development`