# Knowledge Summary（PM 生成）

> 任务级知识摘要：PM 在分派前从 `.ai/knowledge/` 提炼，放入 shared 供各 Team 只读。
> 生成者：project-manager-agent | task_id：refund-feature | 时间：2026-09-20

## 本次任务相关知识（从知识库提炼）
| 知识项 | 来源 | 备注 |
|--------|------|------|
| 技术栈：Spring Boot + MyBatis-Plus + MySQL | `.ai/knowledge/architecture.md` | Java Team 实现参照 |
| 分层约定 / 9 维度审查 | `.ai/knowledge/patterns.md` | reviewer 参照 |
| 已知坑：状态机扩展须回归旧状态 | `.ai/knowledge/gotchas.md` | 测试重点 |
| 构建/测试命令 | `.ai/knowledge/commands/build.md` | EngOps / tester 参照 |
| 决策约束（ADR-001） | `.ai/knowledge/decisions/` | 不违反既有决策 |

## Team 分派
- **java**：本任务执行团队，读 `teams/java/team-context.md` + 本摘要
- 其他 Team：只读参考，不直接参与

## 使用方式
各 Team Lead 开工时：
1. 读 `.ai/context/shared/knowledge/knowledge-summary.md`（本文件）
2. 读自己 `.ai/context/teams/{team}/team-context.md`
3. 按需查 `.ai/knowledge/` 原文（只读）

> 权限：knowledge-summary.md 只读；Team 不直接改知识库，变更走 Knowledge Team。
