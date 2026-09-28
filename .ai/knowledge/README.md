# MyTeam 项目知识库

> 由 project-knowledge-manager 维护。严格项目隔离：本库只描述 MyTeam 项目的 Agent 配置知识。

## 索引
| 文件 | 用途 |
|------|------|
| `overview.md` | 项目总览（PM 启动读取）：架构分层 / 部门 / Lead / 知识速查 |
| `architecture.md` | 项目架构：24 agent / 6 team / workflows / MCP 布局 |
| `patterns.md` | 配置模式：agent JSON 结构、prompt 引用、权限模型 |
| `decisions/` | ADR 架构决策记录 |
| `commands/` | 构建 / 调试 / 验证命令 |
| `gotchas.md` | 路径陷阱、常见错误、已知 Bug 模式 |
| `team/conventions.md` | 配置风格约定 |

## 使用
- 初始化 / 更新知识库：`@project-knowledge-manager`
- 记录决策：`@adr-recorder`
- 查询：先读本库，再查代码

## 项目性质
MyTeam 是 OpenCode Agent 配置型项目（非 Maven/Node）：
- `agents/` `workflows/` `docs/` — 项目级配置与文档
- `opencode.json` — 项目级 Agent / MCP / Provider 配置
- 全局配置在 `C:\Users\Administrator\.config\opencode\`
