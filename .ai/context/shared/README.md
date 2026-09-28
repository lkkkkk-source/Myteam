# Shared Context

> 跨 Team 共享上下文区。各 Team 只读 shared；写入方见各文件头部。

## 目录
| 路径 | 用途 | 写者 |
|------|------|------|
| `knowledge/knowledge-summary.md` | 任务知识摘要 | PM |
| `handoff/` | 跨 Team 交接记录 | 交接双方 Lead |
| `artifacts/` | 跨 Team 共享产物 | 产出 Agent |

## 约定
- 共享即公开：写入 shared 的内容 = 所有 Team 可见
- 权限隔离：各 Team 自己的内部上下文在 `teams/{team}/`，不得互相读写
