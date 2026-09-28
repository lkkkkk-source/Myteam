# MyTeam OpenCode Plugin Wrapper（v1.0.1）

> 将 MyTeam 封装为 **OpenCode Plugin**，实现宿主隔离，避免污染 OpenCode 原生环境。

## 分层

```
OpenCode (Host Runtime)
   ↓
MyTeam Plugin (plugin/opencode/)
   ↓
MyTeam Platform Core (source/ · platform/ · registry · .ai/context/  — 就地只读)
```

- **OpenCode = Host Runtime**；**MyTeam = Independent Plugin**。
- 插件**就地读取** MyTeam 仓库，**不复制文件**到 `~/.config/opencode`，不污染用户全局环境。

## 文件

| 文件 | 职责 |
|---|---|
| `manifest.yaml` | Plugin Manifest（name / version / entry / platform_version / capabilities / isolation） |
| `index.ts` | Plugin Entry：初始化 MyTeam → 加载 registry → 加载 agents → 初始化 runtime（只读聚合）+ 隔离守卫 |
| `loader.ts` | Loader：读取 source/ platform/ registry/ runtime/（**不复制文件**，copiedFiles=0） |
| `bridge.ts` | Bridge：OpenCode API ↔ MyTeam Runtime（只读视图 + guardHostWrite） |
| `myteam-plugin.yaml` | Plugin Config：workspace / context_path / enabled_features / isolation |
| `tests/isolation-test.ps1` | 隔离测试（Case1~5 + 不变量，19/19 PASS） |

## 安装（手动，非自动）

OpenCode 从 `~/.config/opencode/plugins/` 或项目 `.opencode/plugins/` 加载本地插件。要以插件方式引用 MyTeam：
1. 在项目 `.opencode/plugins/` 放一个转发文件 `export { MyTeamPlugin } from "D:/data/code/Agent/MyTeam/plugin/opencode/index.ts"`，或在 `opencode.json` 的 `plugin` 中引用发布后的包名；
2. 插件启动时只读 MyTeam 仓库，**不改宿主配置**。
> 本阶段不自动安装；引用即生效，移除引用即卸载（宿主恢复原状）。

## 硬性边界（强制）

- 禁止修改 OpenCode 核心 / 批量复制到 `~/.config/opencode` / 污染全局环境 / 覆盖 `opencode.json` / runtime 反向改 source。
- 只读挂载 source / platform / .ai/context / version-registry；`copy_files: false`。
- 卸载可逆：插件从不写宿主，移除引用即恢复原状（无残留）。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。

详见：`evolution/v1.0.1/reports/v1.0.1-report.md`
