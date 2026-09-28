# OpenCode Agent Platform

> 版本：v0.1.0（固化版） | 可扩展的多 Agent 协作系统

## 1. 当前 Agent 架构（24 个）
```
Advisory ──→ Workflow ──→ Development ──→ Knowledge ──→ EngOps
 (方案)        (流程)       (实现)          (沉淀)       (生命周期)
```

### 六大 Team
| Team | Agent 数 | 职责 |
|------|---------|------|
| **Java** | 6 | Java 项目设计→开发→审查→测试→调试 |
| **Research** | 5 | 文献综述→分析→创新→实验→论文 |
| **Creative** | 4 | PPT / 简历 / 写作 / 编辑 |
| **Advisory** | 3 | 讨论 / 需求 / 方案 |
| **Knowledge** | 2 | 知识库管理 / ADR 记录 |
| **EngOps** | 4 | Git / Changelog / Release / 健康检查 |

## 2. Agent 分类
| Agent | 职责 |
|-------|------|
| java-architect | 架构分析、技术栈、模块关系、修改范围 |
| java-planner | 需求拆解、任务规划、影响分析 |
| java-developer | 代码实现（TDD） |
| **java-reviewer** | **综合审查 9 维度**：代码质量 / Spring / MyBatis / SQL / 安全 / 性能 / 可观测性 / 测试 / 依赖 |
| java-tester | 编译 + 单元/集成测试 + 失败分析 |
| java-debugger | 疑难失败定位 |
| literature-agent | 文献检索与综述 |
| research-analyst | 数据分析、指标设计 |
| innovation-agent | 创新方案 |
| experiment-agent | 实验设计与复现 |
| paper-writer | 论文写作 |
| ppt-agent | 演示文稿生成 |
| resume-agent | 简历优化 |
| writing-agent | 写作与内容创作 |
| editor-agent | 审核：逻辑/表达/格式/可读性 |
| discussion-agent | 头脑风暴、多角度讨论 |
| requirement-agent | 需求澄清、验收标准 |
| solution-architect | 方案比较与技术选型 |
| project-knowledge-manager | 项目知识库（`.ai/knowledge/`）维护，项目隔离 |
| adr-recorder | ADR 架构决策记录 |
| git-manager | Git 状态/提交/分支，禁 push/force |
| changelog-agent | 从提交生成 CHANGELOG |
| release-agent | SemVer 打 tag + 发布说明（需批准） |
| project-health-agent | 项目健康检查（含知识库鲜度），**只读** |

## 3. Workflow 列表（8 个）
| Workflow | 场景 |
|----------|------|
| `feature-development` | 完整功能开发（≥5 文件） |
| `quick-fix` | 单纯 bug 修复 |
| `refactor` | 跨模块重构 |
| `java-feature-development` | Java 功能开发（精简版） |
| `research-paper` | 论文写作全流程 |
| `research-workflow` | 科研流程 |
| `content-create` | 内容创作 |
| `creative-workflow` | 创意流程 |

## 4. Knowledge 设计
```
<project-root>/.ai/knowledge/
├── README.md             # 索引
├── architecture.md       # 项目架构 / 模块 / 决策
├── patterns.md           # 编码模式 / 约定
├── decisions/            # ADR(熟悉) 决策记录
├── commands/             # 构建 / 测试 / 部署命令
├── gotchas.md            # 坑 / 经验 / 已知 Bug 模式
└── team/                 # 团队约定
```
- **项目隔离**：知识严格按项目存放，禁止全局混合库
- **Memory（MCP）** 只存跨会话元信息，项目事实一律入 `knowledge/`

## 5. EngOps 流程
```
git-manager ──→ changelog-agent ──→ release-agent ──→ project-health-agent
 (规范提交)       (生成 CHANGELOG)    (SemVer + tag)     (健康检查)
```
- **Commit 规范**：Conventional Commits（`type(scope): summary`）
- **Tag 规范**：`v{major}.{minor}.{patch}`，发布需用户批准
- **红线**：git-manager 禁止 push/force/amend；release 禁止外部 publish；health 只读

## 6. 使用方式
### 交互式调用
```
@java-architect       # 架构分析
@java-reviewer        # 综合代码审查（9 维度）
@project-health-agent # 项目健康检查
@git-manager          # Git 状态 / 提交
@release-agent        # 发布（需批准）
```

### Workflow 驱动
```
1. 提需求 → requirement-agent 澄清
2. solution-architect 出方案（Advisory）
3. feature-development workflow（Java Team 执行）
4. EngOps 提交 → 变更记录 → 发布
5. project-health-agent 定期体检 + 知识库同步
```

### 知识沉淀
- 决策已定 → `@adr-recorder` 写 ADR
- 发现新坑 → `@project-knowledge-manager` 补 gotchas
- 架构变化 → 更新 architecture.md

## 版本信息
| 项 | 值 |
|----|-----|
| Agent | 24 |
| Workflow | 8 |
| MCP | 5（context7 / fetch / playwright / sequential-thinking / memory） |
| Skills | 26（CC Switch 软链，未改动） |
| Provider | 11 |
| 配置位置 | `C:\Users\Administrator\.config\opencode\` |
| 备份 | `backup/opencode.json.backup-{时间戳}` |