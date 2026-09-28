# Router Planning Layer (v0.6.1)

> Router = PM 能力。本目录存放 **Intent Analysis** 与 **Project Planning** 的产物与记录。
> Router 只做**项目层规划**；执行拆解归 Scheduler（**禁止** Router 生成 Agent step）。

## 目录

| 路径 | 内容 |
|------|------|
| `intent/` | 每个任务的意图分析 `{task_id}-intent.yaml`（由 PM 整理 discussion-agent 输出） |
| `plans/` | 每个任务的项目阶段计划 `{task_id}-project-plan.yaml`（3~6 个 milestone，Owner=Lead） |
| `milestones/` | 里程碑状态跟踪 `{task_id}-milestone-status.yaml`（可选，轻量） |
| `history/` | 规划变更历史 `planning-history.yaml`（版本演进 + 变更原因） |
| `tests/` | v0.6.1 测试 case 文件 |

## 流转

```
用户 → PM/Router
   → discussion-agent（intent 分析，只读，可选）
   → intent/{id}-intent.yaml（confidence）
   → classification + route（v0.6 不变）
   → plans/{id}-project-plan.yaml（milestone，Owner=Lead）
   → Scheduler 读 plan → 拆执行
   → Lead 协调 → Agent 执行
```

## 边界

- **Router 输出**：intent + milestone 阶段计划（含 teams / dependencies / owner=Lead）
- **禁止**：`steps` / `agent_assignments` / `parallel_groups` / `runtime_schedule`
- **Scheduler**：读取 project-plan 生成 execution-plan；**禁止**重新判断项目目标
- 计划变更必须写 `history/planning-history.yaml`（版本 +1 + 变更原因）

## 相关规范

- `docs/router-intent-planning-spec.md`（本层规范）
- `docs/router-task-classification-spec.md`（v0.6 路由规范）
