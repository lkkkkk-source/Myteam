# Router / Task Classification Specification (v0.6)

> 目标：把 `project-manager-agent` 升级为 **Project Manager + Router**（不新增 Agent），
> 实现：用户 → PM/Router → 理解任务 → 分类 → 选择负责部门 → Lead 协调执行。
>
> 系统从「用户 → PM → Team」升级为「用户 → PM/Router → 理解任务 → 选择部门 → Lead 协调」。

## 1. 定位与边界
- **Router 是 PM 的能力升级**，不是新 Agent：`project-manager-agent` 承担路由 / 分类职责，Agent 数保持 30
- 输入：用户原始需求（含澄清结果）
- 输出（由 PM 写入 `router/`）：
  - `classification/{task_id}.yaml` —— 任务分类（type / domain / cross_team / 分类依据）
  - `routes/{task_id}-route.yaml` —— 路由决策（目标 team / lead / workflow / route_reason）
  - `coordination/{task_id}-coordination.yaml` —— 跨团队协调（多 Lead 责任分配，仅 cross-team 任务）
- **路由只选部门与 Lead，不自动选执行 Agent**（执行编排仍归 Lead，Selection 禁止）
- 不改 Scheduler 核心职责 / 不新增 Team / 不改 8 Workflow 定义

## 2. 目录结构
```
.ai/context/router/
├── rules/routing-rules.yaml              # 路由规则表（关键词 → team/lead/workflow）
├── classification/{task_id}.yaml         # 每任务分类结果
├── routes/{task_id}-route.yaml           # 每任务路由决策
└── coordination/{task_id}-coordination.yaml  # 跨团队责任分配（仅 cross-team）
```

## 3. Task Classification 设计
`classification/{task_id}.yaml`：
```yaml
version: 1
task_id: "task-xxx"
classified_at: "..."
request_summary: "一句话需求摘要"
classification:
  type: "feature | research | content | ops | cross-team | advisory"
  domain: "java | research | creative | engops | mixed"
  cross_team: false
  keywords_matched: ["java", "接口"]
  reason: "分类依据（引用匹配到的关键词 / 语义判断）"
route_hint: "java-lead"        # 初步路由提示，最终路由见 routes/
```

## 4. Routing Rules 设计
`rules/routing-rules.yaml`（规则优先级从上到下，先命中先生效）：
```yaml
version: 1
rules:
  - id: "R1"
    match: { type: "feature", domain: "java" }
    route_to: { team: "java", lead: "java-lead", workflow: "java-feature-development" }
  - id: "R2"
    match: { type: "research", domain: "research" }
    route_to: { team: "research", lead: "research-lead", workflow: "research-paper" }
  - id: "R3"
    match: { type: "content", domain: "creative" }
    route_to: { team: "creative", lead: "creative-lead", workflow: "content-create" }
  - id: "R4"
    match: { type: "ops", domain: "engops" }
    route_to: { team: "engops", lead: "engops-lead", workflow: "quick-fix" }
  - id: "R5"
    match: { cross_team: true }
    route_to: { mode: "multi-lead", coordination_file: "router/coordination/{task_id}-coordination.yaml" }
  - id: "R6"
    match: { type: "advisory" }
    route_to: { mode: "direct-coordination", agents: ["discussion", "requirement", "solution-architect"] }
```

## 5. Cross-Team 协调设计
`coordination/{task_id}-coordination.yaml`：
```yaml
version: 1
task_id: "task-xxx"
coordinator: "project-manager-agent"   # PM 做跨团队总协调
leads:
  - team: "java"
    lead: "java-lead"
    responsibility: "后端接口实现"
  - team: "research"
    lead: "research-lead"
    responsibility: "数据分析与结论"
execution_order: ["research", "java"]   # 建议执行顺序（供 Lead 参考）
handoff: "research 产出分析结论 → java 依据结论实现接口"
```

## 6. 与各层集成
- **Context**：`current-task.yaml` 增加 v0.6 router 指针（classification / route / coordination）与 `routing` 块
- **Task Memory**：`task-memory.yaml` 的 resume_directive / decisions 包含 routing 信息（Case5 恢复可用）
- **Scheduler**：只读 route 结果（lead / workflow），不改 Scheduler 职责
- **Lifecycle**：task-phase `received → routed → planning`（routed 为新过渡阶段，由 PM 标记）

## 7. 流程
```
用户需求
  ↓ project-manager-agent（Router 职责）
1. 理解任务（需求理解 + 澄清）
2. 分类 → 写 router/classification/{task_id}.yaml
3. 匹配 rules → 写 router/routes/{task_id}-route.yaml
4. 跨团队 → 写 router/coordination/{task_id}-coordination.yaml
5. 交 Lead 协调执行（不自动选执行 Agent）
```

## 8. 测试 case（router/tests/）
| Case | 场景 | 验证 |
|------|------|------|
| 1 | 功能任务 | route → java-lead |
| 2 | 论文任务 | route → research-lead |
| 3 | PPT 任务 | route → creative-lead |
| 4 | 跨团队任务 | 多 Lead 责任分配 |
| 5 | 任务恢复 | Task Memory 含 routing 信息 |

## 9. 红线
- Router 是 PM 能力，不是新 Agent：Agent 保持 30
- 路由只选部门 / Lead，不自动选执行 Agent
- 不改 Scheduler 核心职责 / 不新增 Team / 不改 8 Workflow
- 本阶段不做：Router 增强（规划能力）、Capability Recommendation（v0.5.2）
