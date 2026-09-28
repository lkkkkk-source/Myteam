# feature-development（完整功能开发）

## 使用场景
- 新增模块 / 功能
- 跨多个文件（≥ 5）的开发任务
- 涉及新接口、新表、新业务逻辑

## 输入
- 需求描述（功能目标、验收标准、涉及模块）
- 可选：参考代码 / 既有接口

## 调用 Agent 顺序
> **入口：`java-lead` 负责按本流程编排**（PM 分派任务到 java-lead，由 Lead 依次协调以下 Agent）。直接调用以下 Agent 亦可，但经 Lead 可保证编排一致。

1. **java-architect** — 阅读项目、分析技术栈与模块关系、定位修改范围
2. **java-planner** — 需求拆解、任务规划、文件影响分析
   - 输出任务清单（可并行分组）
3. **java-developer** — 按任务实现代码（TDD）
   - 多任务可用 `dispatching-parallel-agents` 并行分发
4. **java-reviewer** — 综合审查 9 维度：Java 代码质量 / Spring 设计 / MyBatis / SQL / 安全 / 性能 / 可观测性 / 测试覆盖 / 依赖与构建
   - 只提出问题，不改代码
   - 参考知识库 `.ai/knowledge/patterns.md`（项目约定）与 `.ai/knowledge/gotchas.md`（已知坑），避免误报
   5. **java-tester** — 编译 + 单元/集成测试 + 失败分析
6. **java-lead** — 汇总架构/代码/测试结果，回报 PM（经 PM 交付用户）

## 迭代规则
- Reviewer 提出问题 → Developer 修复 → 回到 Step 5 复测
- Tester 发现 bug → Developer 修复 → 复测
- Debugger 仅在"难以定位的失败"时介入（java-debugger）

## 跳过规则
- 小型功能（< 3 文件、单模块、无新表）：跳过 java-architect
- 已有成熟任务分解：跳过 java-planner

## 输出要求
- 架构分析（修改范围 / 影响面）
- 任务清单
- 代码改动清单
- 测试报告（通过率 + 失败清单）
- 变更摘要

## 结束条件
- 全部测试通过
- Reviewer 无 Blocker/Major 级问题
- 变更可编译

## 不适用
- 跨 2+ 模块且需要重新设计 → 用 `refactor`
- 单纯 bug 修复 → 用 `quick-fix`