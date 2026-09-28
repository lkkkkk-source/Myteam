# Artifact Lifecycle Specification (v0.3.4)

> 定义 artifact 状态机 + 统一 metadata 格式。
> 与 task-lifecycle 联动：artifact 在 EXECUTING 阶段产生（draft），REVIEW 阶段确认（approved），任务 COMPLETE/ARCHIVE 阶段归档（archived）。

## 1. Artifact 状态机

```
draft → reviewing → approved → archived
   │        │          │           │
   ▼        ▼          ▼           ▼
 creator  reviewer   reviewer    PM
 产生     送审       确认        归档
```

| 状态 | 触发 | 负责方 | 含义 |
|------|------|--------|------|
| `draft` | Agent 产生 artifact | creator（architect/developer/paper-writer 等） | 初稿，未审 |
| `reviewing` | creator 提交审查 | reviewer | 审查中 |
| `approved` | reviewer 通过 | reviewer | 已确认，可进入下一步 |
| `archived` | 任务结束 / PM 归档 | PM | 归档快照（只读） |

**流转规则**：
- `draft → reviewing`：creator 完成产物，登记到 artifacts/ + 更新 metadata
- `reviewing → approved`：reviewer 通过；不通过则回退 `draft` 并附意见
- `approved → archived`：任务 `complete` 后 PM 归档；archived 状态**只读不可改**
- 状态只能单向推进（approved 不可回退到 draft，除非 reviewer 重新发起）

## 2. Artifact Metadata 统一格式

每个 artifact 在同目录放置 `{name}.meta.yaml`，结构统一：

```yaml
artifact:
  id: "refund-architecture"        # artifact 唯一标识
  name: "refund-feature-architecture"
  type: "architecture"            # architecture / code / review / research / creative
  team: "java"                    # 产生 Team
  task: "refund-feature"          # 归属任务
  creator: "java-architect"       # 产生 Agent
  status: "approved"             # draft / reviewing / approved / archived

  # 时间线
  created_at: "2026-09-20T11:58:00"
  reviewed_at: null              # reviewer 通过时间（approved 时填）
  archived_at: null              # 归档时间（archived 时填）

  # 流转
  history:
    - status: "draft"
      at: "2026-09-20T11:58:00"
      by: "java-architect"
    - status: "reviewing"
      at: "2026-09-20T12:10:00"
      by: "java-reviewer"
    - status: "approved"
      at: "2026-09-20T12:20:00"
      by: "java-reviewer"

  # 关联
  depends_on: []                 # 输入 artifact id 列表
  consumed_by: []                # 下游 step / agent
  path: ".ai/artifacts/architecture/refund-feature-architecture.md"
```

## 3. 各 Agent 的 artifact 职责
| Agent | 产生 artifact | 初始状态 | 提交给 |
|-------|--------------|---------|--------|
| java-architect | 架构文档 | draft | java-reviewer |
| java-developer | 代码 / diff | draft | java-reviewer |
| java-tester | 测试报告 | draft | java-reviewer |
| paper-writer | 论文稿 | draft | research reviewer |
| content-writer | 成稿 | draft | creative editor |
| git-manager | 提交记录 | — | engops 内部 |

> reviewer / editor 确认时：把 metadata.status 改 `approved` + 填 `reviewed_at` + 追加 history。
> PM 归档时：把 `approved` artifact 改 `archived` + 填 `archived_at`。

## 4. 与 task-lifecycle 联动
- EXECUTING：creator 产 draft → 登记 artifacts/ + metadata
- RECOVERY：失败不改变 artifact 状态（artifact 仍是 draft/reviewing）
- COMPLETE：PM 验收后，approved artifact 进入 archived
- ARCHIVE：任务关闭，全部 artifact 置 archived（只读）

## 5. 目录约定
```
.ai/artifacts/{type}/{task_id}/
├── {name}.md          # artifact 本体
└── {name}.meta.yaml   # metadata（统一格式）
```
