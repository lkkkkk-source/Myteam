# 模板：execution-state.yaml

> 复制到 `.ai/context/runtime/execution-state.yaml` 后按需编辑。
> Lead 在任务关键节点更新；本阶段仅状态记录，非自动调度。

```yaml
version: 1
task_id: "{task_id}"
team: "{team}"
updated_at: "{ISO 时间}"
owner: "{lead}"

steps:
  - id: "step-{n}"
    agent: "{agent}"
    status: "pending"          # pending / running / completed / failed / blocked / skipped
    started_at: null
    finished_at: null
    output: null               # 完成时登记 artifact 路径
    error: null                # 失败时写 errors/{task_id}-step-{n}.log 并登记路径

agent_status:
  - agent: "{agent}"
    status: "pending"
    since: null

progress:
  total: 0
  completed: 0
  running: 0
  failed: 0
  pending: 0
  next_step: "step-{n}"
```

# 模板：queue/pending-steps.yaml

```yaml
version: 1
task_id: "{task_id}"
pending:
  - step: "step-{n}"
    agent: "{agent}"
    parallel_group: ""
    ready: false
    reason: ""
last_updated: "{ISO 时间}"
```

# 模板：errors/{task_id}-step-{n}.log

```yaml
version: 1
task_id: "{task_id}"
step: "step-{n}"
agent: "{agent}"
time: "{ISO 时间}"
severity: "major"              # minor / major / blocker
message: ""
cause: ""
recovery_hint: ""
related: []
```
