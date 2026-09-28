# Developer Experience Spec（v1.1）

> 与 `myteam-cli-spec.md` 配套：CLI 定义"有哪些命令"，本文定义"开发者/用户体验流程与治理"。

## 0. 目标

把 MyTeam 从 **Plugin Framework** 升级为 **可维护的 Agent Platform 产品**：用户可通过统一 CLI 管理、诊断、验证、升级、回滚，而无需了解内部实现，也不会污染 OpenCode 宿主。

## 1. 用户旅程

```
myteam init      # 初始化工作环境（只检查）
   ↓
myteam status    # 一屏看清 version / agents(30) / mcp(5) / skill(26) / runtime / lifecycle
   ↓
myteam doctor    # 运行时诊断（healthy/warning/error，不自动修复）
   ↓
OpenCode 加载 MyTeam Plugin（就地只读，宿主隔离）
   ↓
开始使用 Agent Organization
```

发布 / 维护旅程：`myteam validate`（发布前一致性）→ `myteam upgrade --dry-run`（预演迁移计划）→ 人工批准 → 迁移 → `myteam rollback`（失败可回滚，历史保留）。

## 2. 角色分工

| 角色 | 职责 | 边界 |
|---|---|---|
| **用户** | 运行 init/status/doctor 查看与诊断 | 不触发部署 |
| **project-manager-agent** | 读取 CLI status 做项目状态展示 | 只读 |
| **engops-lead** | CLI release lifecycle：build / version / changelog / rollback | 不自动安装 |
| **project-health-agent** | 检查 Plugin CLI 一致性（命令可用性 / manifest / version / lifecycle / 隔离） | 只报告 |

## 3. Lifecycle 治理

`plugin-state.yaml` 记录生命周期（installed → loaded → healthy / degraded → disabled），**record-only**，人工迁移。CLI 与 health 只读此状态。

## 4. 可维护性原则

- **可诊断**：doctor 覆盖 plugin / source / registry / runtime / opencode。
- **可验证**：validate 在发布前拦截不一致（version mismatch / count drift）。
- **可升级 / 可回滚**：upgrade 默认 dry-run + approval gate；rollback 复用 Recovery，历史保留。
- **可追踪**：所有变更经 manifest / migration-log / version-registry 登记。

## 5. 硬性边界（强制）

- CLI 只管理 状态 / 验证 / 迁移 / 回滚；不自动安装 / 不改 OpenCode 配置 / 不执行任务 / 不选 Agent / 不改 Prompt / 不调 Model Routing。
- 宿主隔离：CLI 与 Plugin 均不写 `~/.config/opencode`，卸载可逆。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
