# Workflow 使用指南

本指南列出当前 OpenCode Agent 系统的所有标准 Workflow，说明其适用场景、调用 Agent 顺序与使用方式。

**设计原则**
1. 简单任务不强制走全链路（如小 Bug 跳过 architect）
2. Workflow 不含固定死的所有步骤，允许按任务复杂度跳过
3. 大重构 / 新功能必须调用 architect，小修复不必

**触发方式**：在交互会话中指定"走 xxx workflow"，由主 Agent（build）按文档顺序通过 Task 工具分派 subagent；或在 `@agent` 调用时引用本 workflow 作为上下文。

---

## 现有 Workflow 列表

| 文件 | 用途 | 主要 Agent | 典型调用链 | 何时用 |
|------|------|-----------|-----------|--------|
| `workflows/quick-fix.md` | 快速修复 | debugger → developer → tester | 3 Agent 串行 | 有明确现象的 Bug、配置调整、< 3 文件小改 |
| `workflows/feature-development.md` | 完整功能开发 | architect → planner → developer → reviewer → tester | 5 Agent 全链路 | 新功能 / ≥ 5 文件 / 新接口或新表 |
| `workflows/refactor.md` | 代码重构 | architect → planner → developer → reviewer → tester | 5 Agent，强调回归测试 | 不改变外部行为的架构 / 性能优化 |
| `workflows/research-paper.md` | 科研论文全流程 | literature → analyst → innovation → experiment → paper-writer | 5 Agent 串行，可并行检索 | 从研究问题到论文初稿 |
| `workflows/content-create.md` | 内容创作 | writing / ppt / resume → editor | 2 Agent，按体裁分派 | 文章 / PPT / 简历 / 文档 |

---

## 详细调用说明

### 1. quick-fix
- **输入**：Bug 现象 / 配置项 / 小改动目标
- **链路**：`java-debugger`（根因已知则跳过）→ `java-developer`（TDD 修）→ `java-tester`（复测）
- **结束条件**：测试通过、无回归

### 2. feature-development
- **输入**：需求描述 + 验收标准
- **链路**：`java-architect` → `java-planner` → `java-developer` → `java-reviewer` → `java-tester`
- **可跳过**：小功能跳过 architect，已有任务分解跳过 planner
- **迭代**：reviewer 提问 → developer 修 → 复测；bug 交 debugger 定位

### 3. refactor
- **输入**：重构目标 + 行为契约（不能改动的 API）
- **链路**：与 feature-development 相同，但 tester 阶段必须做**全量回归**验证行为不变
- **可跳过**：单点性能调优跳过 architect

### 4. research-paper
- **输入**：研究问题 / 领域
- **链路**：`literature-agent` → `research-analyst` → `innovation-agent` → `experiment-agent` → `paper-writer`
- **可并行**：不同子主题文献检索可分派多个 literature-agent；论文各章节可并行起草
- **迭代**：假设被实验推翻 → 回 innovation-agent；引用失败 → 回 literature-agent

### 5. content-create
- **输入**：主题 + 读者 + 体裁
- **链路**：按体裁选择 `writing-agent` / `ppt-agent` / `resume-agent` 之一 → `editor-agent`
- **可跳过**：短篇跳过 editor；仅润色只调 editor

---

## 选择建议（决策表）

| 任务特征 | 推荐 Workflow |
|---------|--------------|
| 有明确现象的已知 Bug | `quick-fix` |
| 新增功能，涉及多文件 | `feature-development` |
| 不改变行为，优化代码/架构 | `refactor` |
| 从研究问题到论文 | `research-paper` |
| 单篇论文精读 | 只调 `literature-agent`（无需完整 workflow） |
| 方法/实验设计 | 只调 `experiment-agent` |
| 文章 / PPT / 简历 / 文档 | `content-create` |
| 纯润色不重写 | 只调 `editor-agent` |

---

## 与 Agent 权限的对应关系
- 只读 Agent（`java-architect` / `java-reviewer` / `editor-agent`）：在所有 workflow 中承担"分析/审查"角色，不产生文件变更
- 编辑 Agent（`java-developer` 及科研 / 创作 Agent）：产生内容但受 workflow 的"跳过规则"约束
- Workflow 本身是**编排文档**，不修改 Agent 权限，通过 Task 工具驱动 subagent 按序执行

## 扩展约定（后续阶段实现）
- 本阶段仅建稳定 Workflow 层，**不引入 Router 类 Agent**
- 如需自动选择 workflow，未来可新增 primary agent（如 `workflow-router`）读取本目录做分派
- 新增 workflow 请遵循 5 字段结构：使用场景 / 输入 / 调用 Agent 顺序 / 输出要求 / 结束条件