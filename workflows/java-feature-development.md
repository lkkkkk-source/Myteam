# Java 功能开发工作流

> 从需求到可交付代码的完整 Java 后端开发流程。

## 流程总览

```
需求
 ↓
架构分析      → java-architect
 ↓
方案设计      → java-planner
 ↓
代码实现      → java-developer
 ↓
代码审核      → java-reviewer
 ↓
测试          → java-tester
 ↓
Bug 修复      → java-developer / java-debugger
 ↓
完成
```

## 阶段说明

### 1. 需求输入
- 输入：功能需求描述、验收标准
- 若需求模糊：先调用 `brainstorming` 澄清

### 2. 架构分析（java-architect）
- 阅读项目、识别技术栈、分析模块关系
- 输出：架构分析文档 + 受影响范围
- 只读，不改代码

### 3. 方案设计（java-planner）
- 拆解任务、分析文件影响、划分依赖与并行分支
- 调用 `writing-plans` 固化计划
- 输出：开发计划（任务清单 + 验收标准）

### 4. 代码实现（java-developer）
- 调用 `test-driven-development` 先写测试
- 实现 Controller / Service / Mapper / Entity / SQL
- 需要隔离工作区时调用 `using-git-worktrees`

### 5. 代码审核（java-reviewer）
- 审查 Java 规范 / Spring 设计 / MyBatis / SQL / 安全 / 性能
- 调用 `requesting-code-review` 发起正式审查
- 输出：问题清单，只提问题

### 6. 测试（java-tester）
- Maven 编译 + 单元/集成测试
- 失败时调用 `systematic-debugging`
- 声明通过前调用 `verification-before-completion`

### 7. Bug 修复（java-developer / java-debugger）
- 简单缺陷 → java-developer 修复
- 疑难问题 → java-debugger 定位根因后交 developer
- 修复后回到阶段 5/6 复核

## 并行协作点
- **阶段 3 后**：多个无依赖任务可由 `dispatching-parallel-agents` 并行分发
- **阶段 5**：reviewer 与 tester 可并行工作（reviewer 审代码，tester 跑测试）
- **阶段 2**：多个模块的架构分析可并行

## 参与 Agent
| 阶段 | Agent | 权限 |
|------|-------|------|
| 架构分析 | java-architect | 只读 |
| 方案设计 | java-planner | 写计划文档 |
| 代码实现 | java-developer | 读写代码 |
| 代码审核 | java-reviewer | 只读 |
| 测试 | java-tester | 执行命令 |
| Bug 修复 | java-developer / java-debugger | 读写代码 |

## 质量门禁
- 未通过审核不得进入合并
- 未实际运行测试不得声称通过
- 未定位根因不得改代码