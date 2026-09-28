# Role–Agent Binding Spec — v1.4.3

权威映射文件：`platform/organization/agent-role-binding.yaml`

关系：`agent_id → role_id → team_id`（30/30 全覆盖，org-2）。

## Role 原语（10）

| Role | Responsibility | 核心能力 |
|------|----------------|----------|
| architect | architecture-and-design | system-design, api-contract-design |
| planner | planning-and-decomposition | task-planning, decomposition |
| developer | implementation | coding, debugging, testing |
| tester | validation | validation, quality |
| reviewer | review-and-quality | code-review, quality-assessment |
| analyst | analysis-and-inquiry | analysis, requirement-gathering, research-inquiry |
| writer | content-authoring-and-editing | technical-writing, academic-writing, editing |
| ops | engineering-operations | git-workflow, build-packaging, release-management |
| manager | orchestration-and-governance | orchestration, knowledge-management, memory-management |
| lead | team-leadership-and-coordination | coordination, task-decomposition, review |

> 说明：spec 明确要求的 5 个 role（architect / developer / tester / reviewer / analyst）为核心原语；
> 另 5 个（lead / planner / writer / ops / manager）为达成 30/30 **诚实绑定** 所需的静态建模原语，
> **非运行时自动新增**（org-7）。

## 30 Agent 绑定表

| Agent | Role | Team |
|-------|------|------|
| java-lead | lead | software-engineering |
| java-architect | architect | software-engineering |
| java-planner | planner | software-engineering |
| java-developer | developer | software-engineering |
| java-debugger | developer | software-engineering |
| java-tester | tester | software-engineering |
| java-reviewer | reviewer | software-engineering |
| research-lead | lead | research |
| research-analyst | analyst | research |
| literature-agent | analyst | research |
| experiment-agent | analyst | research |
| innovation-agent | analyst | research |
| paper-writer | writer | research |
| creative-lead | lead | creative |
| writing-agent | writer | creative |
| editor-agent | writer | creative |
| ppt-agent | writer | creative |
| resume-agent | writer | creative |
| engops-lead | lead | engops |
| project-health-agent | reviewer | engops |
| git-manager | ops | engops |
| release-agent | ops | engops |
| changelog-agent | ops | engops |
| solution-architect | architect | advisory |
| requirement-agent | analyst | advisory |
| discussion-agent | analyst | advisory |
| project-manager-agent | manager | pm |
| adr-recorder | manager | pm |
| project-knowledge-manager | manager | pm |
| task-memory-agent | manager | pm |

合计：**30 / 30**（每个 Agent 恰好一条 binding）。

## 校验（`myteam organization validate`）

- schema：organization / team / role / binding 齐全。
- binding：30/30 覆盖，agent 唯一。
- reference：binding 的每个 team/role 在 `teams/`、`roles/` 有定义。
- registry：`team-registry.yaml` 保持为 Runtime Registry 且含 `organization_ref`（未被替代）。
- baseline：Agent=30 / MCP=5 / Skill=26 / Workflow=8。
- forbidden：无 `auto_add_team / auto_add_role / auto_replace_agent / auto_select_agent / auto_restructure`。

## Lookup 示例

```
myteam organization trace java-developer
  Agent: java-developer
  Role:  developer
  Team:  software-engineering
  chain: software-engineering -> developer -> java-developer
```
