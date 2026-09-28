# Runtime Adapter Spec（v1.0）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 职责，不改 Workflow 核心行为。
> 上游：v0.6.2 Source Runtime Separation（source/build/runtime 分层）+ v0.9 Controlled Execution。
> 建立 MyTeam Source → OpenCode Runtime 的**受治理映射层**（Runtime Adapter）。

## 0. 目标

MyTeam 已成为 Agent Platform **Source Repository**，但缺少 Source → Runtime Deployment 管理层。历史上部分文件直接改 `C:\Users\Administrator\.config\opencode\`，导致 source/runtime 边界模糊、来源不可追踪、回滚困难、多环境同步困难。

Runtime Adapter 建立唯一映射与部署链路：

```
MyTeam Source → Build Package → Runtime Adapter → Migration Plan → Approval → OpenCode Runtime
```

**MyTeam = Source of Truth；OpenCode = Runtime Deployment。** 禁止 runtime 反向改 source。

## 1. Adapter 架构

`platform/runtime-adapter/`：
| 文件 | 职责 |
|---|---|
| `adapter-schema.yaml` | 映射字段契约（source_path / runtime_path / asset_type / version / checksum / deployment_status / last_sync）+ 5 不变量 + forbidden |
| `opencode-adapter.yaml` | 集成边界：允许同步 / 禁止碰的 runtime 目标 |
| `agent-binding.yaml` | 30 Agent：platform_agent → runtime_agent + source_prompt + version + checksum |
| `mcp-binding.yaml` | 5 MCP：声明同步（不自动新增） |
| `skill-binding.yaml` | 26 Skill：引用同步（cc-switch 管理实体） |
| `deployment-manifest.yaml` | 一次部署内容 + 审批状态（draft→reviewing→approved→installed→failed→rolled_back） |
| `migration-plan.yaml` | 迁移流程（build→backup→apply→verify→commit / rollback） |
| `rollback-plan.yaml` | 回滚（复用 Recovery + rollback/backups） |
| `sync-state.yaml` | source vs runtime 版本 + drift 检测（只报告） |

## 2. Binding 机制

- **Agent Binding**：30 Agent 全覆盖，version 对齐 version-registry（java-developer/architect/reviewer/tester/research-analyst=v2，其余 v1），checksum=source prompt sha256（前 16 位占位）。
- **MCP Binding**：5 MCP 只同步声明；不自动新增 MCP、不覆盖用户 mcp block。
- **Skill Binding**：26 Skill 只同步引用；skill 实体由 cc-switch 管理，不覆盖不删除。

## 3. Migration 流程

`migration-plan.yaml`（手动执行）：`M1 build → M2 verify-baseline → M3 backup → M4 apply(asset copy, platform-owned only) → M5 verify(hash check) → M6 rollback(on fail) → M7 commit`。
- backup 必须先于 apply；verify 失败自动进入 rollback，不留半安装状态。
- 仅当 deployment-manifest.status=approved 才由人工触发。

## 4. Rollback 流程

`rollback-plan.yaml`：**复用 Recovery（strategy-registry / checkpoints）+ rollback/backups + v0.9 execution rollback**，不重设计。字段 `backup_ref / previous_version / restore_steps / verification`。guards 复用 rollback-manifest 红线（不碰 skills/.opencode/.omo/node_modules）。

## 5. OpenCode Integration Boundary

`opencode-adapter.yaml`：
- **允许同步**：agent prompt / agent metadata（merge agent block）/ mcp declaration / skill reference / workflow / docs。
- **禁止碰**：opencode.json 的 mcp(user)/provider/shell、skills 实体、.opencode/.omo/node_modules、用户私有数据、任务状态、Memory、Runtime 执行记录。
- 只单向同步（Source → Runtime），禁止反向。

## 6. project-health-agent 检查项（v1.0）

见 `deployment-governance-spec.md` 第 6 节与 `project-health-agent.md` 第 17 项。

## 7. 硬性边界（强制）

- 禁止直接改 runtime 作为开发方式；禁止 runtime 反向改 source。
- 禁止自动安装 / 自动升级 / 自动覆盖用户配置 / 自动删除旧版本 / 自动运行任务。
- drift 只报告不自动修复。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
