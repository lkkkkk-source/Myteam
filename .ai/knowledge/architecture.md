# MyTeam 架构

## Agent 布局（24 个全局 Agent）
- **Java Team**（6）：java-architect / java-planner / java-developer / java-reviewer / java-tester / java-debugger
- **Research Team**（5）：literature-agent / research-analyst / innovation-agent / experiment-agent / paper-writer
- **Creative Team**（4）：ppt-agent / resume-agent / writing-agent / editor-agent
- **Advisory Team**（3）：discussion-agent / requirement-agent / solution-architect
- **Knowledge Team**（2）：project-knowledge-manager / adr-recorder
- **EngOps Team**（4）：git-manager / changelog-agent / release-agent / project-health-agent

## Prompt 目录
```
C:\Users\Administrator\.config\opencode\prompts\
├── java/        (6)
├── research/    (5)
├── creative/    (4)
├── advisory/    (3)
├── knowledge/   (2)
└── engops/      (4)
```

## Workflows（8 个）
- `workflows/quick-fix.md` `feature-development.md` `refactor.md`
- `research-paper.md` `content-create.md`
- 早期版本：`java-feature-development.md` `research-workflow.md` `creative-workflow.md`

## Docs（5 个）
- `docs/workflow-guide.md` `advisory-guide.md` `project-knowledge.md` `engops-guide.md`

## MCP（5 个）
context7 / fetch / playwright / sequential-thinking / memory（见全局 opencode.json）

## 关键链路
- 开发：discussion → requirement → solution-architect → feature-development workflow
- 知识：project-knowledge-manager 维护 `.ai/knowledge/`；adr-recorder 写 ADR
- 生命周期：git-manager（提交）→ changelog-agent（CHANGELOG）→ release-agent（tag/发布）→ project-health-agent（健康检查）
