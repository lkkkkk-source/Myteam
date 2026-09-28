# 配置模式

## Agent JSON 结构
每个 agent 条目：
```json
"agent-name": {
  "description": "一句话职责",
  "mode": "subagent",
  "temperature": 0.2,
  "prompt": "{file:./prompts/<team>/<agent>.md}",
  "permission": {
    "edit": "allow|deny",
    "bash": "allow|deny",
    "read": "allow",
    "grep": "allow",
    "glob": "allow",
    "list": "allow"
  }
}
```

## prompt 引用规则
- 统一用 `{file:./prompts/<team>/<name>.md}` 相对路径
- 提示文件存放在 `prompts/`（OpenCode 不扫描）
- **不要**把 prompt 放进 `agents/`（OpenCode 会把 `agents/*.md` 当 markdown-agent 自动扫描）

## 权限模型
- 只读分析 Agent（architect / reviewer / editor / discussion / solution / knowledge-manager 的读）：`edit: deny`
- 写代码 / 文档 Agent（developer / writer / adr-recorder / requirement）：`edit: allow`
- 需要跑命令（tester / developer / knowledge-manager）：`bash: allow`

## 项目隔离
- 全局 Agent 定义在 `C:\Users\Administrator\.config\opencode\opencode.json`
- 项目级配置（MyTeam 自有）在 `D:\data\code\Agent\MyTeam\opencode.json`
- 知识库在项目内：`<project-root>/.ai/knowledge/`
