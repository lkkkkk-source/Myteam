# MyTeam CLI Spec（v1.1）

> 系统层能力（工具层），**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 核心职责，不改 Workflow 核心行为。
> 上游：v1.0.1 MyTeam OpenCode Plugin Wrapper。
> 目标：让 MyTeam 从「开发者维护的 Plugin」升级为「用户可管理的软件工具」——提供 CLI + Diagnostics + Lifecycle + Upgrade 管理。

## 0. 定位

`tools/myteam-cli/` 是 MyTeam 的**命令行管理工具**：只读治理（管理 / 状态 / 验证 / 迁移 / 回滚），**不安装、不改 OpenCode、不执行任务**。

用户体验：`myteam init → myteam status → myteam doctor → OpenCode 加载 MyTeam → 使用 Agent Organization`。

## 1. 结构

```
tools/myteam-cli/
├── package.json          # bin.myteam / version 1.1.0 / commands / isolation
├── bin/myteam.mjs        # Node 可运行入口（src/*.ts 的等价实现；TS 为规范源）
├── src/
│   ├── index.ts          # 命令分发
│   ├── commands/         # init / status / doctor / validate / upgrade / rollback
│   ├── services/         # plugin-service / registry-service / validation-service / migration-service
│   └── output/formatter.ts
└── tests/cli-test.ps1
```

## 2. 命令

| 命令 | 功能 | 边界 |
|---|---|---|
| `myteam init` | 检查 plugin manifest / workspace / source path / runtime adapter → "MyTeam initialized" | 不安装 / 不改 OpenCode / 不复制文件 |
| `myteam status` | 显示 version / plugin / agents 30 / teams / mcp 5 / skill 26 / runtime / adapter / evolution / lifecycle | 只读 |
| `myteam doctor` | Runtime Diagnostics：plugin / source / registry / runtime / opencode（healthy/warning/error）| 不自动修复 |
| `myteam validate` | 发布前检查：agent(registry↔source↔version) / mcp / skill / adapter / evolution → validation report | 不修复；FAIL 阻止 release |
| `myteam upgrade` | 升级治理：detect→backup→plan→approval→apply→verify；**默认 dry-run** | 不自动升级生产 |
| `myteam rollback` | 复用 Recovery + rollback-plan：select backup→restore→verify | 不删除历史 |

## 3. Diagnostics（doctor）

检查维度：`plugin.manifest / source.exists / source.hash / registry.agent / registry.team / registry.capability / runtime.adapter / runtime.sync(drift report-only) / opencode.loading / opencode.isolation`。输出 overall: healthy | warning | error。**只报告，从不自动修复。**

## 4. Validate（发布前）

`agent binding = 30` / source_prompt 全存在 / version 对齐 version-registry / mcp=5 / skill=26 / adapter-schema 存在 / version-registry 存在。任一 error → `validation: FAIL (release blocked)`（exit 1）。

## 5. Upgrade / Rollback 治理

- `upgrade`：默认 `--dry-run`，输出 planned changes + migration flow（backup 先于 apply、approval gate）；`--apply` 仍被 approval + backup 阻断（no production auto-upgrade）。
- `rollback`：复用 Recovery + `rollback-plan.yaml`，`deletes_history: false`；恢复为手动。

## 6. Plugin Lifecycle

`plugin/opencode/plugin-state.yaml`：`lifecycle_state` ∈ { installed, loaded, healthy, degraded, disabled }，含 history（只增）。**只记录，不执行自动决策**；状态迁移由 engops-lead 人工维护。

## 7. 硬性边界（强制）

- CLI 只管理 **状态 / 验证 / 迁移 / 回滚**；禁止自动安装插件 / 自动改 OpenCode 配置 / 自动执行任务 / 自动选 Agent / 自动改 Prompt / 自动调 Model Routing。
- CLI 命令不写 `~/.config/opencode`（宿主隔离，可逆）。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
