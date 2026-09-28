# Task Lifecycle Trace Spec（v1.4.1）

> 与 `debug-trace-spec.md` 配套：Debug-Trace 定义"追踪机制"，本文定义"一次任务生命周期的 12 层链路"。

## 0. 目标

把一次任务从 User Request 到 Evolution Feedback 的全过程，串成**可查询、可审计的生命周期链路**。

## 1. 12 层生命周期链路

```
User Request
  ↓ router      classification_completed  → router/classification
  ↓ team        routing_completed         → team-registry / routes
  ↓ agent       agent_assigned            → capability/agent-capabilities
  ↓ collaboration handoff_created         → collaboration/handoffs (HO-*)
  ↓ workspace   change_created            → workspace/changes (CH-*)
  ↓ action      action_proposed           → runtime-action/records (AP-*)
  ↓ approval    action_approved           → action-ledger (AP-*)
  ↓ execution   execution_completed       → execution-engine (EE-*)
  ↓ quality     gate_passed               → quality/gate-state
  ↓ artifact    artifact_linked           → workspace/artifact-links
  ↓ memory      memory_archived           → memory/task-memory
  ↓ evolution   evolution_feedback        → model-routing/feedback
```

## 2. 示例（TR-0001 / refund-feature）

`myteam trace show refund-feature` 输出 12 层全覆盖（EV-0001..EV-0012），每层一个事件、引用真实来源、无代码内容。

## 3. 链路完整性

- `complete=true` 要求 12 层均有事件且 reference 有效。
- `missing_references` 记录悬空引用（health 校验）。
- timeline 模式按 timestamp 排序，呈现执行顺序。

## 4. 与既有层的关系

- 每层事件只是**指针视图**：真实数据仍在各层（collaboration / workspace / execution / quality / memory / evolution）。
- Trace 不改变任何层的数据或行为；删除 trace 不影响任务本身。

## 5. 硬性边界（强制）

Trace 只呈现生命周期，不驱动生命周期：不执行 / 不修复 / 不调度 / 不改状态。
基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
