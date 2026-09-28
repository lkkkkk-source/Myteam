# Agent Platform Source Runtime Separation — v0.6.2 Report

- **日期**：2026-09-21
- **范围**：Source / Runtime 分离工程化（MyTeam = 源码仓库；OpenCode 全局 = 运行环境）
- **基线确认**：Agent=30 · MCP=5 · Skill=26 · Workflow=8

## 1. 当前架构调整

从「直接修改 OpenCode 全局配置」升级为「源码 -> 构建 -> 安装 -> 运行环境」的完整工程生命周期：

```
MyTeam (源码仓库)
  ├─ source/        开发唯一修改点
  ├─ build/         打包
  ├─ installer/     手动安装计划（不自动执行）
  └─ migration+rollback  迁移与回滚
        │
        ▼
C:\Users\Administrator\.config\opencode   (运行环境，开发期只读)
```

开发阶段**不再修改**运行环境；运行环境只在明确、经批准的手动安装流程中更新。

## 2. Source Layer 设计

| 项 | 值 |
|----|----|
| 根目录 | `D:/data/code/Agent/MyTeam/source/` |
| prompts | `source/prompts/` — 30 个 Agent Prompt |
| docs | `source/docs/` — 22 个平台文档 |
| workflows | `source/workflows/` — 8 个工作流 |
| config | `source/opencode_source.json` — 平台配置（agent=30, mcp=5） |

规则：开发只改 `source/`；`source/` 不依赖运行环境状态。

## 3. Manifest 设计

`manifest/platform-manifest.yaml`

- release id: v0.6.2
- baseline 冻结：agent=30 / mcp=5 / skill=26 / workflow=8
- 定义 Source / Build / Runtime / Installer / Migration / Rollback 各层路径
- 声明 not_implemented（auto-install / auto-upgrade / capability-selection / agent-auto-replace）

## 4. Build Layer 设计

`build/scripts/build-package.ps1`

- 校验 manifest 基线
- 校验 source 数量（prompts=30, docs=22, workflows=8, agents=30）
- 打包到 `build/package/opencode-agent-platform-v0.6.2/`
- 仅导出 `config/agent-fragment.json`（agent 块），**不覆盖 mcp/provider**
- 生成 MANIFEST.txt

验证结果：BUILD OK。

## 5. Runtime Template 设计

`runtime/templates/runtime-layout.md`

运行环境标准形态（安装后）：

```
C:\Users\Administrator\.config\opencode\
├── prompts\      # 30 platform prompts
├── docs\         # 22 platform docs
├── workflows\    # 8 workflows
├── skills\       # 26 CC Switch (未触碰)
├── opencode.json # base + agent block (mcp/provider 用户持有)
├── .opencode\    # 未触碰
└── node_modules\ # 未触碰
```

## 6. Installer 设计

`installer/install-plan.yaml`（手动执行）

1. verify-baseline（校验包与基线）
2. backup-runtime（快照到 rollback/backups/）
3. install-prompts / docs / workflows（platform-owned 覆盖）
4. merge-config（只合并 agent 块；不动 mcp/provider/shell）
5. record-migration（写 migration-log）

当前 install_status = `not-installed`。

## 7. Migration 设计

`migration/migration-log.yaml`
- m-001：v0.6.2 initial build（source → build，built；not-installed）
- 约定：install 前必须已记录 source 版本 / 包路径 / target runtime / 备份路径

## 8. Rollback 设计

`rollback/rollback-manifest.yaml` + `rollback/backups/`
- restore-config：从 backups 恢复 opencode.json
- restore-prompts/docs/workflows：从包或快照恢复
- verify：恢复后校验基线
- guards：不触碰 skills/、node_modules/

## 9. 测试结果

`tests/run-tests.ps1` — 5 Cases 全部 PASS：

| Case | 覆盖 |
|------|------|
| C1 | 基线冻结（manifest 30/5/26/8，runtime 无 agent） |
| C2 | Source 完整性（prompts=30, docs=22, workflows=8, agents=30, mcp=5） |
| C3 | Runtime 不被开发触碰（installer 为唯一写路径且手动） |
| C4 | Migration 可追踪（log 含 v0.6.2） |
| C5 | Rollback 信息完整（manifest + backups） |

TOTAL: 5/5 passed。

## 已修改 Agent（3，未新增/删除）

| Agent | 变更 |
|-------|------|
| project-manager-agent | 读取平台状态；知版本与部署状态；不得新增 Agent；部署只建议不自动装 |
| engops-lead | 负责 build/release 流程；构建脚本；审核安装计划；手动安装需用户批准 |
| project-health-agent | 新增 Source/Runtime 一致性检查维度；只报告不安装 |

## 当前基线确认

| 项 | 数值 | 校验 |
|----|------|------|
| Agent | 30 | C2 PASS |
| MCP | 5 | C2 PASS |
| Skill | 26 | manifest / CC Switch 管理 |
| Workflow | 8 | C2 PASS |

## 本阶段明确不实现

- ❌ 自动安装 / 自动升级
- ❌ Capability Selection
- ❌ Agent 自动替换