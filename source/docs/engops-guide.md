# Engineering Operations Guide

Engineering Operations Team（EngOps）提供软件生命周期管理能力，共 4 个 Agent：

| Agent | 职责 | 权限 | 关键约束 |
|-------|------|------|---------|
| `git-manager` | Git 状态 / 规范提交 / 分支 | 读写 + 可执行 | **禁止** push / force-push / amend |
| `changelog-agent` | 从提交生成 Keep a Changelog | 读写 + 可执行 | 只写 CHANGELOG.md，不触碰 Git 历史 |
| `release-agent` | SemVer 决策 / 打 Tag / 发布说明 | 读写 + 可执行 | **必须用户批准**才执行；禁止外部 publish |
| `project-health-agent` | 项目健康检查（含知识库鲜度） | **只读** | 不修复、不提交、不发布 |

---

## 1. Git Agent 职责

### git-manager
- 检查 `git status` / `diff` / `log`
- 规范提交（Conventional Commits：`type(scope): summary`）
- 分支管理（feature / fix / 合并前检查）
- 处理本地冲突

### 严格红线
| 禁止 | 原因 |
|------|------|
| `git push` / `force-push` | 需用户批准，防止误推 |
| `git amend` / `commit -i` | 防止重写历史 |
| 改 `git config` / skip hooks | 防止破坏仓库配置 |

### commit 风格
匹配仓库既有 commit 风格；提交前必须查 `status` + `diff` + `log`。

## 2. Release 流程

```
changelog-agent          →   CHANGELOG.md
        │
        ▼
release-agent（SemVer 决策）
        │
   ├─ 决定版本号 bump（breaking→major / feat→minor / fix→patch）
   ├─ 起草发布说明
   ├─ ⚠️ 用户批准
   ├─ 打 tag: git tag vX.Y.Z
   ├─ 更新版本文件（pom.xml / package.json）
   └─ ⚠️ 用户批准
   └─ （可选）push
```

**SemVer 规则**：
- MAJOR：不兼容 API 变更
- MINOR：向后兼容新功能
- PATCH：向后兼容 bug 修复

**禁止**：
- 自动 publish 到外部（Maven Central / npm / Docker）
- 覆盖既有 tag
- 未批准自动执行

## 3. Commit 规范（Conventional Commits）
```
type(scope): summary

type ∈ {feat, fix, docs, style, refactor, test, perf, build, ci, chore}
```
- 提交前必查 `git status` / `diff` / `log`
- 不提交密钥 / 敏感信息
- 匹配仓库既有风格

## 4. Tag 规范
- 格式：`v{major}.{minor}.{patch}`（如 `v1.2.0`）
- 打 tag 前 CHANGELOG 必须已更新
- 不覆盖历史 tag
- 破坏性变更需先经 `solution-architect` / `discussion-agent` 确认

## 5. 与 Java Team 的关系
| 场景 | 协作 |
|------|------|
| feature 开发完成 | `java-reviewer` 审查通过 → `git-manager` 规范提交 → `changelog-agent` 生成 |
| 发布前 | `release-agent` 读 CHANGELOG 打 tag；pom.xml 版本更新 |
| 重构 / 修复 | `git-manager` 管理分支；`changelog-agent` 记录 fix / refactor |
| 健康检查 | `project-health-agent` 评估 Git 状态 + 构建 + 知识库 |

## 6. 与 Knowledge 的关系
- `project-health-agent` 检查 `.ai/knowledge/` 是否过期（architecture.md vs 实际代码）
- 发现决策未记录 → 提示 `adr-recorder` 补 ADR
- 发现新坑 → 提示 `project-knowledge-manager` 补 `gotchas.md`
- 发布后 → 提示更新 `knowledge/` 的 ADR 索引

**不创建全局 Knowledge**：EngOps 只读项目内知识库，不写全局库。

## 7. 权限规则
| Agent | edit | bash | 说明 |
|-------|------|------|------|
| git-manager | allow | allow | 可写文件 + 跑 git 命令（受 prompt 红线约束） |
| changelog-agent | allow | allow | 可写 CHANGELOG + 读 git log |
| release-agent | allow | allow | 可写版本文件 + 打 tag（受"需批准"约束） |
| project-health-agent | **deny** | allow | 只读：只能跑检查命令，不能改文件 |

> prompt 内的"禁止 push / 禁止 amend / 需批准"是 Agent 行为约束；`bash: allow` 让它能执行 `git` 只读/写命令。实际红线由 prompt + 人工审批双重保障。

---

## 调用链路
```
开发（java-team）
    ↓ 完成
git-manager（规范提交）
    ↓
changelog-agent（生成 CHANGELOG）
    ↓
release-agent（打 tag + 发布说明，需批准）
    ↓
project-health-agent（检查发布后健康 / 知识库鲜度）
```

## 扩展边界
- 本阶段**不**增加 Router / Database / Security / QA Agent
- EngOps 聚焦生命周期：Git / Changelog / Release / 健康
- 代码审查仍在 `java-reviewer`，QA 测试仍在 `java-tester`