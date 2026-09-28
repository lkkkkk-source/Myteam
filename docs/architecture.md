# MyTeam Agent 架构文档

本地多 Agent 协作系统：**Java 软件工程团队 / 科研研究团队 / 创作团队**。

## 1. 文件结构

```
MyTeam/
├── opencode.json                    # 项目级 Agent 配置（prompt 引用 prompt 文件，不含正文）
├── agents/
│   ├── java/
│   │   ├── java-architect.md        # 架构分析（只读）
│   │   ├── java-planner.md          # 任务规划
│   │   ├── java-developer.md        # 编码实现
│   │   ├── java-reviewer.md         # 代码审查（只读）
│   │   ├── java-tester.md           # 测试执行
│   │   └── java-debugger.md         # 问题诊断
│   ├── research/
│   │   ├── literature-agent.md      # 文献调研
│   │   ├── research-analyst.md      # 前沿分析
│   │   ├── innovation-agent.md      # 创新点设计
│   │   ├── experiment-agent.md      # 实验设计
│   │   └── paper-writer.md          # 论文写作
│   └── creative/
│       ├── ppt-agent.md             # 演示文稿
│       ├── resume-agent.md          # 简历优化
│       ├── writing-agent.md         # 内容写作
│       └── editor-agent.md          # 内容审核（只读）
├── workflows/
│   ├── java-feature-development.md  # Java 开发流程
│   ├── research-workflow.md         # 科研流程
│   └── creative-workflow.md         # 创作流程
└── docs/
    └── architecture.md              # 本文档
```

## 2. Agent 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        OpenCode                             │
│            (opencode.json  →  15 个 subagent)               │
└───────────────┬─────────────────────────┬───────────────────┘
                │                         │
     ┌──────────▼──────────┐   ┌──────────▼──────────┐
     │   Team 1: Java      │   │   Team 2: Research  │
     │   软件工程团队        │   │   科研研究团队        │
     │                     │   │                     │
     │ java-architect ────►│   │ literature-agent ──►│
     │ java-planner ◄───── │   │ research-analyst ◄─ │
     │ java-developer ◄───►│   │ innovation-agent ◄─ │
     │ java-reviewer ◄──── │   │ experiment-agent ◄─ │
     │ java-tester   ◄───► │   │ paper-writer   ◄──  │
     │ java-debugger ◄───  │   │                     │
     └─────────────────────┘   └─────────────────────┘

     ┌─────────────────────┐
     │   Team 3: Creative  │
     │   创作团队            │
     │                     │
     │ ppt-agent ────────► │
     │ resume-agent ─────► │
     │ writing-agent ────► │
     │ editor-agent ◄───── │
     └─────────────────────┘

     ┌──────────────────────────────────────────────────┐
     │ 共享基础设施                                       │
     │  MCP: context7 · fetch · memory · playwright     │
     │       · sequential-thinking                       │
     │  Skills: CC Switch 软链接 27 个（复用，不改动）      │
     └──────────────────────────────────────────────────┘
```

## 3. Agent 职责总表

| Agent | 职责 | 模式 | 权限 |
|-------|------|------|------|
| java-architect | 项目阅读/技术栈/模块关系/架构方案 | subagent | 只读 |
| java-planner | 需求拆解/任务规划/依赖排序 | subagent | 写计划文档 |
| java-developer | Controller/Service/Mapper/Entity/SQL/测试 | subagent | 全量 |
| java-reviewer | Java/Spring/MyBatis/SQL/安全/性能审查 | subagent | 只读 |
| java-tester | 编译/单测/集成测试/失败分析 | subagent | bash |
| java-debugger | 日志/调用链/根因/修复方案 | subagent | bash |
| literature-agent | 搜论文/读论文/方法总结/趋势 | subagent | 读+写文档 |
| research-analyst | 前沿/趋势/研究空白 | subagent | 写文档 |
| innovation-agent | 创新点/可验证假设 | subagent | 写文档 |
| experiment-agent | 方法/实验/数据集/指标 | subagent | bash |
| paper-writer | Abstract/Intro/Related/Method/Exp | subagent | 写文档 |
| ppt-agent | PPT 结构/页面/内容组织 | subagent | 写文档 |
| resume-agent | 简历结构/项目描述/技能包装 | subagent | 写文档 |
| writing-agent | 技术文章/博客/文档 | subagent | 写文档 |
| editor-agent | 逻辑/表达/格式/可读性审核 | subagent | 只读 |

## 4. 协作方式

- **团队内串行**：按 workflow 顺序流转，上一 Agent 输出作为下一 Agent 输入
- **跨 Agent 并行**：无依赖任务用 `dispatching-parallel-agents` 编排（见各 workflow 的"并行协作点"）
- **共享记忆**：`memory` MCP 承载项目结构、文献图谱、任务进度等跨 Agent 上下文
- **质量门禁**：审核/测试未通过不进入下一阶段；声明完成前用 `verification-before-completion` 验证

## 5. 使用方式

在 OpenCode 会话中通过 `@agent-name` 或 Task 工具调用：

```
@java-architect 分析当前 Spring Boot 项目的模块结构
@java-planner 将"新增用户管理"拆解为任务
@java-reviewer 审查 src/main 最近改动
@literature-agent 调研 GraphRAG 最新进展
@editor-agent 审核我的技术文章
```

或运行完整流程时，读取对应 `workflows/*.md` 按阶段推进。

## 6. 接入 OpenCode

本项目无需全局配置，接入仅两步：

1. 在本目录（或其 git clone）启动 `opencode`，自动读取项目级 `opencode.json`
2. 所有 15 个 agent 立即可用（`opencode agent list` 可见，`opencode debug agent <name>` 可验证）

设计要点：
- `opencode.json` 仅含元数据与 `{file:...}` 引用，正文全部在 `agents/**/*.md`，单文件即文档即 Prompt
- 未修改全局 `~/.config/opencode/opencode.json`、未改动 CC Switch 软链接 Skill、未创建新软链接
- 复用全部已有 MCP 与 Skills，Agent Prompt 只做"角色 + 编排 + 工具策略"组织