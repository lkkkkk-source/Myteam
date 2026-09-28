# Project Knowledge System 使用说明

知识系统严格按项目隔离。每个项目在自己的根目录下维护知识库，互不干扰。

## 核心原则
- **知识库在项目内，Agent 在全局**
- 知识目录：`<project-root>/.ai/knowledge/`
- **禁止**全局混合知识库
- `project-knowledge-manager` 与 `adr-recorder` 是全局 Agent，但只操作**当前项目**的知识库

## 目录结构（初始化后）
```
<project-root>/.ai/knowledge/
├── README.md              # 索引与使用说明
├── architecture.md        # 架构、模块、关键设计
├── patterns.md            # 编码模式与约定
├── decisions/             # ADR
│   ├── README.md
│   └── adr-001-<slug>.md
├── commands/              # 构建/测试/部署命令
│   └── build.md
├── gotchas.md             # 坑与经验
└── team/                  # 团队约定（可选）
    └── conventions.md
```

## 使用方式
| 操作 | 触发 |
|------|------|
| 初始化 / 更新知识库 | `@project-knowledge-manager` |
| 记录架构决策 | `@adr-recorder` |
| 查询项目知识 | `@project-knowledge-manager`（先查库再查码） |

## Memory / Knowledge 边界
| 维度 | Memory（全局 MCP） | Knowledge（项目内） |
|------|--------------------|--------------------|
| 存放位置 | MCP memory 存储 | `<project-root>/.ai/knowledge/` |
| 隔离性 | 全局共享 | 项目隔离 |
| 内容 | 跨会话偏好、agent 元信息 | 项目事实、架构、决策 |
| 举例 | "用户常用 Maven" | "订单模块用 PostgreSQL" |

**规则**：Memory 只存"哪个项目已初始化、ADR 序号到几"等元信息；项目事实一律写入项目内 knowledge。

## 与 Java Team 协作
1. `java-architect` 分析代码 → 结论写入 `architecture.md`（由 project-knowledge-manager 落地）
2. `java-reviewer` 发现约定 → 补入 `patterns.md` / `team/conventions.md`
3. `java-tester` 发现坑 → 补入 `gotchas.md`
4. 开发前查询 knowledge，减少重复分析

## 与 Advisory Team 协作
1. `solution-architect` 的方案被采纳 → `adr-recorder` 固化为 `decisions/adr-XXX.md`
2. `requirement-agent` 的验收标准 → 可登记到 knowledge 的需求索引
3. `discussion-agent` 的决策历史 → 沉淀为 ADR 备选方案记录

## Workflow 集成
| Workflow | 知识介入点 |
|----------|-----------|
| `feature-development` | 开始前查 architecture.md；完成后更新架构/模式 |
| `refactor` | 记录 ADR（重设计理由）；更新 architecture.md |
| `quick-fix` | 修复经验补入 gotchas.md |
| `research-paper` / `content-create` | 一般不需要 knowledge；如涉项目技术，查 architecture.md |

## 安装位置（全局）
```
opencode.json                      # 新增 2 个 agent 条目
prompts/knowledge/
├── project-knowledge-manager.md
└── adr-recorder.md
docs/project-knowledge.md          # 本文件
```

## Guardrails
- 禁止写机密（密钥/密码/内网地址）
- 知识条目必须可溯源，不臆造
- 初始化/更新前先列文件清单，经确认后写入
- 本阶段不实现 Router / Git / Release / Database / Security / QA Agent