# Agent Platform Build System

> Source-Runtime Separation：源码在 MyTeam，运行环境在 OpenCode 全局；开发阶段禁止直接修改运行环境。

## 三层结构

| Layer | Path | 职责 |
|-------|------|------|
| **Source Layer** | `D:/data/code/Agent/MyTeam/source/` | 开发唯一入口：prompts / docs / workflows / opencode_source.json |
| **Build Layer** | `D:/data/code/Agent/MyTeam/build/` | 打包脚本 + 输出 `build/package/opencode-agent-platform-<version>/` |
| **Runtime Layer** | `C:\Users\Administrator\.config\opencode\` | 生产运行环境（技能 + MCP + Agent + 配置）；**开发期只读** |

配套目录：`manifest/`（平台清单）、`installer/`（安装计划，手动执行）、`migration/`（迁移日志）、`rollback/`（回滚备份与步骤）。

## 开发流程

```
modify source ──► test ──► build ──► install(手动审批)
```

1. **modify source**：只改 `source/` 下的 prompts / docs / workflows / 配置。
2. **test**：`tests/` 校验基线（Agent=30、MCP=5、Skill=26、Workflow=8）与 `{file:./prompts/*}` 引用完整性。
3. **build**：运行 `build/scripts/build-package.ps1`，产出安装包（只含 agent 片段，保留用户 mcp/provider）。
4. **install**：审核 `installer/install-plan.yaml`，手动执行（先备份到 `rollback/backups/`），写 `migration/migration-log.yaml`。

## 基线（冻结）

| Item | Count |
|------|-------|
| Agent | 30 |
| MCP | 5 |
| Skill | 26（CC Switch 管理） |
| Workflow | 8 |

## 禁止

- 新增 / 删除 Agent、Team
- 开发阶段修改 `~/.config/opencode`
- 自动安装 / 自动覆盖用户配置
- Capability Selection / Agent 自动替换