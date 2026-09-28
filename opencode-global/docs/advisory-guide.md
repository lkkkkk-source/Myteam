# Advisory Team 使用说明

Advisory Team 是"需求 → 方案"的前置层，由 3 个 Agent 组成：

| Agent | 角色 | 权限 | 产出 |
|-------|------|------|------|
| `discussion-agent` | 讨论顾问 | 只读 | 需求理解 / 关键问题 / 方案比较 / 下一步建议 |
| `requirement-agent` | 需求工程 | 写文档 | 功能列表 / 用户故事 / 技术约束 / 验收标准 |
| `solution-architect` | 方案架构师 | 只读 | 技术路线比较 / 影响 / 风险 / 实施路径 |

**与已有 Team 的边界**
- Advisory 层**不写代码、不改项目文件**，只产出需求与方案文档
- `java-architect` 做的是**代码级**架构分析；`solution-architect` 做的是**业务级**技术路线比较
- Advisory 的产出是后续 Workflow 的输入

---

## 推荐流程

```
用户需求（自然语言）
      ↓
  discussion-agent        ← 澄清目标、发现隐藏需求、提出关键问题、比较方案
      ↓
  requirement-agent       ← 转成可验收的工程需求（功能/故事/约束/标准）
      ↓
  solution-architect     ← 技术路线比较 + 风险评估
      ↓
  feature-development     ← 进入开发 Workflow（java-architect → ... → tester）
```

## 何时使用各 Agent

| 场景 | 建议 |
|------|------|
| 需求模糊、目标不明确 | 先 `discussion-agent` 单独跑，再串后续 |
| 已有清晰目标，只要需求文档 | 直接 `requirement-agent` |
| 已有需求，只做技术选型 | 直接 `solution-architect` |
| 完整需求到开发 | 走完整 3 Agent 链 → `feature-development` |
| 小 Bug / 配置调整 | 跳过 Advisory，直接 `quick-fix` |
| 科研类项目 | Advisory 不覆盖，走 `research-paper` workflow |

## 调用方式
- 交互会话中 `@discussion-agent` / `@requirement-agent` / `@solution-architect` 手动触发
- 或由主 Agent（build）按文档顺序通过 Task 工具分派
- 三者可**并行**讨论不同子主题，最后由 `requirement-agent` 汇总

## 跳过与迭代
- `discussion-agent` 完成后，用户已明确目标 → 可跳过
- `requirement-agent` 若输入已是结构化需求 → 可跳过
- `solution-architect` 若需求简单到唯一技术路线 → 可跳过
- 任何 Agent 输出被用户否决 → 回该 Agent 迭代，不跳级

## 与 Workflow 衔接
Advisory 是 Workflow 的**前置层**：
- 输出需求文档 → 触发 `workflows/feature-development.md`
- 输出方案文档 → 作为 `java-architect` 的分析输入
- 不触发 `quick-fix` / `refactor` / 科研 / 创作 workflow

## 扩展约定
- Advisory 层**不实现 Router**（不做自动分派）
- 新增 Advisory Agent 请遵循：Role / Responsibility / 严格限制 / Workflow / MCP / Skills / Output Format
- Advisory Agent 一律 `edit: deny`，只允许 `requirement-agent` 写 markdown 文档