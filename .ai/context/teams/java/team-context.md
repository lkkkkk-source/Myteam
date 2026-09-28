# Java Team Context

> Team 级上下文：跨任务共享的 Java Team 工作现场。任务内 Context 见 `current-task.yaml`。

## 团队信息
- Lead：`java-lead`
- 子 Agent：java-architect / java-planner / java-developer / java-reviewer / java-tester / java-debugger
- 部门：Java Team

## 团队当前焦点
| 项 | 值 |
|----|----|
| 当前任务 | refund-feature（in-progress） |
| 进行中步骤 | step-2（java-planner） |
| 并行组 | A（step-3/4 可并行） |

## 团队专属知识速查（本 Team 高频约束）
- 状态机扩展须回归现有订单状态
- 财务联动在 scope_out，不碰
- 代码审查 9 维度参考 `.ai/knowledge/patterns.md`

## 与其他 Team 的接口
| 本 Team 需要 | 来源 Team | 方式 |
|--------------|-----------|------|
| 文献/数据 | research | shared/handoff |
| 文档/演示 | creative | shared/handoff |
| 构建/发布 | engops | shared/handoff |

> 权限隔离：Java 只读自己 team 目录 + shared，不写其他 team 目录。

## 交接记录（team 级）
- 见 `.ai/context/shared/handoff/`（跨 Team 时追加）
