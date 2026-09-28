# Scheduler Specification (v0.4)

> Context 从"人工查看 Context 决定下一步"升级为"**Context 驱动的执行建议系统**"。
> Scheduler 只**读取 Context、计算建议、输出建议**，**不自动执行 Agent**（自动执行属后续 Scheduler Runtime 阶段）。

## 1. 定位与边界
- **输入**：task-plan.yaml（步骤 + 依赖）、runtime/execution-state.yaml（步骤状态）、runtime/errors/ + recovery/（失败恢复态）、artifacts meta（产物状态）
- **输出**：`.ai/context/scheduler/execution-plan.yaml`（建议的执行计划）
- **不做**：自动调用 Agent / 自动推进步骤 / 修改 Context。全部由 **Lead 手动执行建议**。

## 2. Scheduler 目录结构
```
.ai/context/scheduler/
├── execution-plan.yaml          # 建议执行计划（Scheduler 输出，Lead 执行前必读）
├── scheduler-state.yaml         # Scheduler 自身状态（last_eval / input_snapshot）
├── dependency-resolver.yaml     # 依赖解析结果（谁 ready / 谁 blocked）
├── policies/
│   ├── resource-policy.yaml     # 资源策略（并行度 / 优先级 / 队列）
│   └── priority-policy.yaml     # 优先级策略（P0-P3 排序规则）
└── decisions/
    └── {task_id}-decision.yaml  # 每次评估的决策记录（含 parallel 建议）
```

## 3. Scheduler 评估流程（5 步）
```
1. 快照输入  →  读 task-plan + execution-state + recovery + artifacts meta
2. 依赖解析  →  dependency-resolver：对每个 step 判断 READY / BLOCKED / DONE
3. 失败检查  →  若 recovery-state 显示失败未恢复 → 输出暂停建议（不继续）
4. 策略应用  →  resource + priority policy → 排序 + 并行建议
5. 输出计划  →  写 execution-plan.yaml（建议 + 理由）+ decision.yaml
```

**结果类型**：
- `ready`：有 step 满足依赖且无失败阻塞 → 建议"执行 step-N"
- `blocked`：无 step 可执行（依赖未满足）→ 建议"等待依赖"
- `paused`：存在未恢复失败 → 建议"先 Recovery，不继续执行"
- `parallel`：多个 step 无依赖 → 建议并行执行（带 parallel_group）

## 4. Dependency Resolver 设计
读 `task-plan.yaml` 的 steps[].depends_on，对照 execution-state 状态判定：
| step 状态 | 依赖全完成 | 结果 |
|-----------|-----------|------|
| completed | — | `done` |
| running / pending | 否 | `blocked`（列出缺哪些依赖） |
| running / pending | 是 | `ready` |
| failed | — | `failed`（转 Recovery） |

输出到 `dependency-resolver.yaml`：
```yaml
version: 1
task_id: "refund-feature"
evaluated_at: "2026-09-20T13:10:00"

resolution:
  - step: "step-1"
    status: "completed"
    result: "done"
  - step: "step-2"
    status: "pending"
    result: "ready"
    depends: ["step-1"]
    unmet: []
  - step: "step-3"
    status: "pending"
    result: "blocked"
    depends: ["step-2"]
    unmet: ["step-2"]
```

## 5. Resource Policy 设计
`policies/resource-policy.yaml` 定义**并行度与准入规则**：
```yaml
version: 1
parallelism:
  default: 2                 # 默认最大并行 Agent 数
  per_team: 2                # 单 Team 并行上限
  max: 3                     # 全局硬上限

allow_parallel: true         # 是否允许 parallel_group
merge_policy: "wait_all"     # parallel 组完成后合并（wait_all / wait_any）

resource_rules:
  - condition: "step 无依赖且同 Team"
    action: "可并行（≤ per_team）"
  - condition: "跨 Team 依赖"
    action: "等待 shared/handoff 就绪"
  - condition: "MCP 密集型 step"
    action: "降级为串行（避免 MCP 超时）"
```

## 6. Priority Policy 设计
`policies/priority-policy.yaml` 定义 step 排序：
```yaml
version: 1
priority_levels:
  P0: ["blocker 依赖", "交付关键路径"]
  P1: ["核心功能 step"]
  P2: ["增强 / 优化 step"]
  P3: ["文档 / 低价值 step"]

sort_rules:
  - "P0 > P1 > P2 > P3"
  - "同优先级：长依赖链优先（critical path）"
  - "同优先级同链长：先到先服务（按 plan 顺序）"
  - "失败恢复的 step 无条件置顶（preempt）"
```

## 7. 输出：execution-plan.yaml
```yaml
version: 1
task_id: "refund-feature"
evaluated_at: "2026-09-20T13:10:00"
suggestion:
  result: "ready"                  # ready / blocked / paused / parallel
  steps_to_run:
    - step: "step-2"
      agent: "java-developer"
      priority: "P1"
      reason: "依赖 step-1 已完成"
  parallel_groups:
    - group: "A"
      steps: ["step-3a", "step-3b"]
      reason: "无相互依赖，符合 resource-policy（≤2）"
  blocked_reason: null
  recovery_hint: null              # result=paused 时填
decision_log: "scheduler/decisions/refund-feature-decision.yaml"
```

## 8. 与既有层的关系
- 消费：task-plan / execution-state / recovery / artifacts meta（只读）
- 产出：execution-plan + decision（Lead 执行前必读）
- **Lead 仍负责调用自己的 Team Agent**；Scheduler 只给建议，不代替 Lead 分派

## 9. 本次不实现
- **不自动执行 Agent**（属 Scheduler Runtime 阶段）
- 不做实时事件驱动（Event Bus）
- 不做跨任务全局优化（后续版本）
