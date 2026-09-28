# Artifact System Specification

> 跨 Agent 的产物传递层。结构化交接、过程可追溯。

## 位置
`.ai/artifacts/{category}/{task_id}/...`

| 分类 | 路径 | 典型产物 |
|------|------|----------|
| 架构 | `artifacts/architecture/` | `{task_id}-architecture.md`（架构分析） |
| 代码 | `artifacts/code/{task_id}/` | 变更文件快照 / diff |
| 审查 | `artifacts/review/` | `{task_id}-review.md`（审查报告） |
| 研究 | `artifacts/research/{task_id}/` | 文献清单 / 实验记录 |
| 创意 | `artifacts/creative/{task_id}/` | 成稿 / 审核意见 |
| 运维 | `artifacts/engops/{task_id}/` | CHANGELOG / 发布说明 |

## 命名
`{task_id}-{类别}-{序号}.md`（序号用于多版本迭代）

## 规范
1. **产出即落盘**：Agent 结束前把成果写入 artifact 路径，并在 `current-task.yaml` 的 `artifacts` 登记指针
2. **只追加不覆盖**：同一产物多轮修改 → 新序号，保留历史（过程可追溯）
3. **交接只传指针**：Agent 交接用 `current-task.yaml` 的指针，不复制大段内容进聊天
4. **输入必读**：Agent 开工先读自己的 `inputs`（artifact / 知识），再开始执行
5. **元数据**：artifact 文件头部写 `task_id / agent / created_at / version` 注释块
6. **归档**：任务结束后 artifact 保留在目录（历史资产），由 knowledge-manager 决定是否提炼进知识库

## 头部注释块示例
```markdown
<!-- artifact: refund-feature-architecture.md -->
<!-- task_id: refund-feature | agent: java-architect | version: 1 -->
<!-- created_at: 2026-09-20T11:45:00 -->
```
