# Multi-Agent Collaboration Spec（v1.3）

> 与 `workspace-layer-spec.md` 配套：Workspace 定义"环境与治理"，本文定义"多 Agent 如何协作而不互相污染"。

## 0. 目标

让多个 Agent 在同一任务下**并行工作而互不污染**：每个 Agent 独立 workspace，变更受追踪，合并受治理，产物受质量验收。

## 1. 隔离模型

```
task: refund-feature
├── WS-0001  java-developer  (branch ws/.../java-developer)   ← 改 src/**
├── WS-0002  java-tester     (branch ws/.../java-tester)      ← 改 src/test/**
└── WS-0003  java-reviewer   (read-only, changes_allowed=none) ← 只评审
```

- 每个 Agent workspace-local；分支唯一；**不写 shared / 不改他人 workspace**（ws-1/ws-2）。
- change-record 绑定 owning agent + workspace；越权即违规。

## 2. 协作流程

```
Agent(各自 workspace) → Change(execution_ref=EE-*) → Checkpoint(复用 Recovery)
     → 提交合并 → Review(reviewer 只读) → Quality Gate → Approval → Merge(人工)
     → Artifact link(merged only)
```

## 3. 冲突治理

- 禁止 automatic_merge；冲突转人工。
- 禁止自动覆盖其他 Agent 的修改（ws-7）。
- merge rejected（review / quality 未过）→ 退回对应 Agent 返工。

## 4. 角色边界

| 角色 | workspace 行为 |
|---|---|
| developer / tester | 在各自 scope 内改（source_modify / test_create） |
| reviewer / architect | 只读 + review，changes_allowed=none |
| PM | 只读 workspace lifecycle + 批准 merge（经 Approval，不直接合并） |
| engops-lead | workspace infrastructure 生命周期（创建 / checkpoint / merge 治理） |

## 5. 与四层分离一致

Workspace 承载"协作过程"；执行细节归 Execution Engine，长期记忆归 Memory，正式产物归 Artifact。四者独立、可追溯。

## 6. 硬性边界（强制）

多 Agent 协作不得：绕过 workspace / 改他人 workspace / 自动合并 / 自动覆盖 / 绕过 review。
基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
