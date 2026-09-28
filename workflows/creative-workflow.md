# 创作工作流

> 从内容需求到成稿的通用创作流程。

## 流程总览

```
需求
 ↓
创作          → ppt-agent / resume-agent / writing-agent
 ↓
审核          → editor-agent
 ↓
优化          → 原创作 Agent
 ↓
成稿
```

## 阶段说明

### 1. 需求输入
- 明确主题、目标读者、体裁、篇幅
- 不明确时调用 `brainstorming` 澄清

### 2. 创作
按体裁分派：
- **演示文稿** → `ppt-agent`（结构 + 页面设计）
- **简历** → `resume-agent`（项目描述 + 技能包装）
- **文章/文档** → `writing-agent`（博客 + 技术文档）
- 需要图表 → `scientific-visualization` / `scientific-schematics`

### 3. 审核（editor-agent）
- 审查逻辑 / 表达 / 格式 / 可读性 / 事实一致性
- 调用 `peer-review` 生成结构化评审报告
- 输出：审核报告 + 修改清单

### 4. 优化
- 原创作 Agent 按审核意见修订
- 涉及事实核对时调用 `fetch` / `context7`
- 迭代直到通过审核

## 并行协作点
- **阶段 2**：PPT / 简历 / 文章若为同一项目可并行创作
- **阶段 3**：多份稿件可由 editor-agent 并行审核

## 参与 Agent
| 阶段 | Agent | 主要 MCP |
|------|-------|----------|
| 演示文稿 | ppt-agent | sequential-thinking, playwright |
| 简历 | resume-agent | memory, fetch |
| 文章/文档 | writing-agent | context7, fetch |
| 审核 | editor-agent | sequential-thinking, fetch |

## 质量门禁
- 事实与数据必须真实，禁止编造
- 代码示例必须可运行或标注伪代码
- 引用他人内容注明来源
- 审核通过后方可定稿