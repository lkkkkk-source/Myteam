# Workspace Layer Spec（v1.3）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 核心职责，不改 Workflow 核心行为。
> 上游：v1.2 Controlled Execution Engine + v0.3.3 Recovery + v0.4.3 Quality Gate + v0.3.4 Artifact Lifecycle。
> 目标：建立 **Agent Workspace Runtime**：`Agent → Workspace → Change Tracking → Review → Quality Gate → Merge → Artifact`。

## 0. 定位与四层分离（强制）

- **Workspace = 管理工作环境**（隔离 / 分支 / checkpoint）
- **Execution = 管理执行过程**（v1.2 execution-engine）
- **Memory = 管理跨会话元信息**（.ai/context/memory）
- **Artifact = 管理正式产物**（.ai/artifacts）
- **Workspace ≠ Execution ≠ Memory ≠ Artifact**（ws-5，不合并）

## 1. Workspace Schema

`platform/workspace/workspace-schema.yaml`：字段 `workspace_id / task_id / agent / team / branch / created_at / status / snapshot_ref`；状态机 `created → initialized → active → checkpointed → reviewing → merged → archived`；7 不变量（ws-1~ws-7）+ forbidden_fields（auto_merge / auto_delete_checkpoint / auto_overwrite / auto_permission_change）。

## 2. Workspace Policy

`workspace-policy.yaml`：每个复杂任务创建独立 workspace；Agent 默认 workspace-local；禁止改 shared workspace / 他人 workspace；高风险修改前必须 checkpoint；checkpoint append-only；权限不自动改。

## 3. Agent Workspace（权限）

`agents/agent-workspace-schema.yaml`：`agent / workspace_id / permissions / scope / changes_allowed`。developer=source_modify+test_create；tester=test_create+run_test；**reviewer/architect=read+review，changes_allowed=none（禁止改代码）**。

## 4. Change Tracking

`changes/change-record-schema.yaml`：`change_id / workspace_id / agent / files / operation / reason / execution_ref / timestamp`。每次修改来自受治理执行（execution_ref → EE-*）；只增审计。

## 5. Snapshot / Checkpoint

`snapshots/checkpoint-schema.yaml`：`checkpoint_id / workspace_id / state_hash / files_snapshot / created_at / recovery_ref`。流程 `Execution → Checkpoint → Continue →（Failure）→ Rollback checkpoint`；**只增不删**，回滚**复用 Recovery**。

## 6. Merge Governance

`merge/merge-policy.yaml`：`Agent workspace → Review → Quality Gate → Approval → Merge`；状态 pending/reviewing/approved/rejected/merged；**automatic_merge=false**；review rejected → blocked；禁止自动覆盖他人修改。

## 7. Artifact Integration

`artifacts/artifact-link-schema.yaml`：`artifact_id / workspace_id / changes / quality_ref / status`。只有 merged workspace 的 change 才关联为 artifact，且带 quality_ref。

## 8. Execution Engine 集成

Execution Request 必含 `workspace_ref`（ws-6）；executor 只能操作指定 workspace，禁止访问未知路径。change-record 的 `execution_ref` 关联 EE-*。

## 9. Memory 集成

Task Memory 只记录 workspace pointer / checkpoint pointer / merge status；**禁止把 workspace 全部内容写入 Memory**（ws-5）。

## 10. CLI

`myteam workspace status | list | trace ID | validate`。

## 11. project-health-agent 检查项（v1.3）

见第 21 项：schema / permissions（reviewer none）/ checkpoint（append-only + recovery）/ merge state（no auto-merge）/ artifact links / 隔离与三层分离。

## 12. 硬性边界（强制）

禁止：自动 merge / Agent 绕过 workspace / Agent 改他人 workspace / 自动删 checkpoint / workspace 替代 Memory / workspace 替代 Artifact / 自动改权限 / 自动覆盖他人修改。
基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
