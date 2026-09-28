# 模板：team-context.md

> 复制到 `.ai/context/teams/{team}/team-context.md` 后按需编辑。

# {Team} Team Context

## 团队信息
- Lead：`{lead}`
- 子 Agent：{agent1} / {agent2} / ...
- 部门：{Team}

## 团队当前焦点
| 项 | 值 |
|----|----|
| 当前任务 | {task_id}（{status}） |
| 进行中步骤 | step-{n} |

## 团队专属知识速查
- {约束1}
- {约束2}

## 与其他 Team 的接口
| 本 Team 需要 | 来源 Team | 方式 |
|--------------|-----------|------|
| {x} | {y} | shared/handoff |

> 权限隔离：本 Team 只读自己 team 目录 + shared，不写其他 team 目录。
