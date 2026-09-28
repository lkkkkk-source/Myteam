# gotchas

## 路径陷阱：agents/ vs prompts/
- `agents/` 目录会被 OpenCode 自动扫描为 markdown-agent
- prompt 文件**必须**放 `prompts/`，不要放 `agents/`
- 错误示例：把 advisory prompt 放进 `agents/advisory/` 导致冲突 → 已修正到 `prompts/advisory/`

## JSON 锚点替换
- 向 `opencode.json` 增量插入 agent 时，用纯文本锚点替换易出错（缩进 / 换行）
- 失败时立即从 `backup/` 恢复，再重来
- 备份路径：`C:\Users\Administrator\.config\opencode\backup\`

## 项目隔离
- 全局 Agent 定义 ≠ 项目知识
- `project-knowledge-manager` 是全局 Agent，但只操作**当前项目**的 `.ai/knowledge/`
- 禁止把多个项目的知识混到一个全局库

## 编码
- PowerShell 5.1 控制台中文显示可能乱码，但 JSON 读写用 UTF8（无 BOM）
- 验证 JSON 用 `ConvertFrom-Json`，不能只看控制台输出

## 已知 Bug 模式（java-reviewer 审查基线）
> 由 java-reviewer 审查中沉淀，作为本项目 Java 代码审查的高频风险清单。

- **SQL 注入**：MyBatis `${}` 拼接用户输入 → 必须用 `#{}`；`LIKE` / `ORDER BY` 动态拼接需白名单
- **N+1 查询**：循环内查库、关联查询未用 join → 用批量查询或 join，必要时开启 batch
- **事务边界错误**：`@Transactional` 放在 Service 但跨方法自调用失效 / 回滚条件未配 → 检查 `rollbackFor`
- **敏感信息泄漏**：日志打印明文密码/token、硬编码密钥、API Key 入知识库 → 一律遮蔽 / 外置
- **越权（IDOR）**：仅凭 ID 操作资源未校验归属 → 加归属校验（水平越权检查）
- **深分页**：`LIMIT offset` 过大变慢 → 改用游标 / keyset 分页
- **异常吞掉**：`catch` 后无日志无重新抛出 → 至少记录上下文可诊断
- **循环内 IO / 远程调用**：性能隐患 → 移到循环外、批量 / 异步化
