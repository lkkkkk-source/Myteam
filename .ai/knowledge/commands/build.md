# commands

## 调试 / 验证命令
```powershell
# 检查全局配置有效性
opencode debug config

# 查看某 agent 是否可加载
opencode debug agent <agent-name>

# 列出所有 agent
opencode agent list

# 查看 provider / mcp
opencode provider list
opencode mcp list
```

## 配置编辑安全约定
1. 编辑 `opencode.json` 前，先备份到 `backup/opencode.json.backup-<时间戳>`
2. 编辑后跑 `opencode debug config` 验证，确认 20 agent 加载成功
3. 项目级配置改动在 `D:\data\code\Agent\MyTeam\opencode.json`
4. 全局配置改动在 `C:\Users\Administrator\.config\opencode\opencode.json`

## 知识库操作
```powershell
# 初始化 / 更新当前项目知识库
# 触发 agent：project-knowledge-manager（交互会话 @project-knowledge-manager）

# 记录 ADR
# 触发 agent：adr-recorder
```
