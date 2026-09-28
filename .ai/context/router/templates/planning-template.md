# Router Planning Template（v0.6.1）

> PM/Router 每接新任务按此模板产出。**只做项目层规划，不生成 Agent step。**

## 1. Intent

```yaml
# .ai/context/router/intent/{task_id}-intent.yaml
task_id: ""
raw_input: ""
intent:
  goal: ""
  success_criteria: []
  scope: { in: [], out: [] }
  constraints: []
  open_questions: []
confidence: high | medium | low
advisory_needed: false
```

## 2. Classification

```yaml
# .ai/context/router/classification/{task_id}.yaml
type: feature | research | content | ops | advisory
domain: java | research | creative | engops | knowledge
cross_team: false
```

## 3. Route

```yaml
# .ai/context/router/routes/{task_id}-route.yaml
team: ""
lead: ""
workflow: ""
route_reason: ""
```

## 4. Project Plan

```yaml
# .ai/context/router/plans/{task_id}-project-plan.yaml
task_id: ""
version: 1
status: draft
milestones:
  - id: "M1"
    title: ""
    deliverables: []
    teams: []
    acceptance: ""
    dependencies: []
    owner: ""          # Lead 级
    status: "pending"
```

## 5. Coordination（仅 cross_team）

```yaml
# .ai/context/router/coordination/{task_id}-coordination.yaml
mode: "multi-lead"
leads: []
execution_order: []
handoffs: []
```

## 禁止字段（Router 输出）

- `steps` / `agent_assignments` / `parallel_groups` / `runtime_schedule` → 归 Scheduler