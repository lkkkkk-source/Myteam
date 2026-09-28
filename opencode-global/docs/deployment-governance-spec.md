# Deployment Governance Spec（v1.0）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 职责，不改 Workflow 核心行为。
> 与 `runtime-adapter-spec.md` 配套：Adapter 定义"映射什么"，本文定义"如何受治理地部署"。

## 0. 目标

建立 **Agent Platform Deployment Governance**：所有部署必须走
`Package → Migration → Approval → Install`，杜绝"直接改 runtime"的历史问题。

```
MyTeam Source → Build → Runtime Adapter → Migration → Approval → OpenCode Runtime
```

## 1. Source / Runtime 分离架构

| 层 | 位置 | 角色 |
|---|---|---|
| Source of Truth | `MyTeam/source/` + `platform/` + `.ai/context/` | 唯一权威，所有开发在此 |
| Build | `build/package/opencode-agent-platform-<ver>/` | 从 source 构建的安装包 |
| Adapter | `platform/runtime-adapter/` | source↔runtime 映射 + 部署治理 |
| Runtime | `C:/Users/Administrator/.config/opencode/` | 部署目标，开发期不直接改 |

**铁律**：开发只改 source；runtime 只通过受治理部署更新；禁止 runtime 反向改 source。

## 2. Deployment 生命周期

`deployment-manifest.yaml` 状态机：
```
draft → reviewing → approved → installed
                  ↘ (rejected: 保持 draft/关闭)
   installed → failed → rolled_back
```
- 当前 DEP-0001：v1.0 全量部署草案，`approval.approved=false`，`status=draft`（未安装）。
- approval=false → runtime **保持不变**（Case4）。

## 3. Migration 流程（治理化）

`migration-plan.yaml`：build → verify-baseline → **backup** → apply(platform-owned only) → **verify(hash)** → commit；任一失败 → rollback。手动触发，非自动。

## 4. Rollback 流程

`rollback-plan.yaml`：复用 Recovery + rollback/backups；失败自动进入回滚（M6），从 backup 恢复 runtime 并校验基线，不留半安装状态。

## 5. Drift 治理

`sync-state.yaml`：比对 source agent-binding.checksum 与 runtime 文件 hash；检测到 source != runtime → 标 `drifted` 并报告，**不自动修复**（交人工经 migration 重新对齐）。

## 6. 一致性检查（project-health-agent 第 17 项）

**17. Deployment Governance / Adapter 一致性（v1.0）**：
- **source/runtime consistency**：agent-binding 的 source_prompt 必须真实存在；version 与 version-registry 对齐（不一致 → Warning）。
- **manifest validity**：deployment-manifest 的 assets 引用的 binding 文件存在，计数与基线一致（agent=30/mcp=5/skill=26/workflow=8）；缺 → Warning，基线不符 → Critical。
- **hash consistency**：若已 installed，runtime 文件 hash 必须匹配 agent-binding.checksum；不一致 → Warning（drift）。
- **migration safety**：migration-plan 必须 backup 先于 apply、verify 失败进 rollback；缺 backup 步骤 → Critical。
- **approval-before-install**：status=installed 的部署必须 approval.approved=true；未批准却 installed → Critical（非法部署）。
- **forbidden / boundary**：adapter/binding/manifest 不得出现 `auto_install / auto_overwrite / reverse_sync / auto_upgrade`（→ Critical）；不得同步到 forbidden_targets（provider/shell/用户 mcp/skills 实体/.opencode/Memory/任务状态/执行记录）。
- 只报告 + 建议，不执行任何部署 / 安装动作（Adapter 生命周期归 engops-lead）。

## 7. 硬性边界（强制）

- 所有部署 = Package → Migration → Approval → Install；禁止直接改 runtime。
- 禁止自动安装 / 自动升级 / 自动覆盖 / 自动删除旧版本 / 自动运行任务 / runtime 反向改 source。
- 只同步平台资产；不碰用户私有数据 / 任务状态 / Memory / Runtime 执行记录。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
