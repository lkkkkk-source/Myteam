# Agent Handoff Spec（v1.4）

> 与 `collaboration-protocol-spec.md` 配套：Protocol 定义"通信总协议"，本文聚焦 **Agent 交接（handoff）** 的规范。

## 0. 目标

让 Agent 交接**结构化、可追溯、带约束与验收**，避免依赖聊天记忆或 notes。

## 1. Handoff 契约

`handoff-schema.yaml`：`handoff_id / from / to / task_context / completed_work / remaining_work / constraints / evidence / acceptance`。

## 2. 典型交接

```
architect → developer
  task_context: refund 模块架构完成，进入编码
  completed_work: 分层设计 / RefundService 契约 / 退款独立表建模
  remaining_work: 实现 calculate-refund / 补边界处理
  constraints: 禁止修改数据库结构 / 遵循 API contract
  acceptance: API contract passed + 阶梯退费 boundary 正确
```

## 3. 交接原则

- **只传结论 + 指针**：completed_work / evidence 用指针（artifact / gate / workspace_ref），不复制完整内容。
- **明确约束**：constraints 写清边界（禁止事项），避免下游越界。
- **明确验收**：acceptance 是下游完成判据。
- **不直接执行**：handoff 产出下游 action proposal，经 Approval → Execution（cl-1），不自动触发。
- **不自动委派**：handoff 是"交接意图"，接收方是否开工由 PM/Lead 分派或 Action 流程决定（禁止 auto_delegate / auto_call_agent）。

## 4. 与 Workspace / Execution 关系

- handoff 常伴随 workspace 切换（from-agent workspace → to-agent workspace）；各自隔离（v1.3）。
- handoff 的 remaining_work 落为下游 Action Proposal，受 Execution Engine 治理（v1.2）。

## 5. 硬性边界（强制）

handoff 不得：自动调用下游 Agent / 自动执行 / 携带完整代码 / 绕过 Approval。
基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
