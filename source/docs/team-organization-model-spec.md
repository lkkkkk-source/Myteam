# Team Organization Model Spec — v1.4.3

## 目标

将 MyTeam 从 **Agent Collection** 升级为 **Agent Organization Model**：

```
Team
 └── Role
      └── Agent
```

本层只负责 **建模 / 映射 / 查询 / 验证**：不新增 / 不删除 / 不复制 / 不重写 Agent，不自动选择 Agent，不替代 `team-registry.yaml`。

## 组织结构

目录：`platform/organization/`

```
organization/
├── organization-schema.yaml     # 模型 + 不变量(org-1~org-7) + forbidden
├── team-schema.yaml             # Team 结构定义
├── role-schema.yaml             # Role 结构定义
├── agent-role-binding.yaml      # 30/30 权威映射 agent -> role -> team
├── teams/                       # 6 teams
│   ├── software-engineering.yaml
│   ├── research.yaml
│   ├── creative.yaml
│   ├── engops.yaml
│   ├── advisory.yaml
│   └── pm.yaml
├── roles/                       # role 原语
│   ├── architect.yaml  developer.yaml  tester.yaml  reviewer.yaml  analyst.yaml
│   └── lead.yaml  planner.yaml  writer.yaml  ops.yaml  manager.yaml
└── integrations/
    ├── router-integration.yaml
    ├── capability-integration.yaml
    ├── collaboration-integration.yaml
    └── trace-integration.yaml
```

## 六个 Team（30 Agent 全覆盖）

| Team | Lead | Agents | 数量 |
|------|------|--------|------|
| software-engineering | java-lead | java-lead, java-architect, java-planner, java-developer, java-debugger, java-tester, java-reviewer | 7 |
| research | research-lead | research-lead, research-analyst, literature-agent, experiment-agent, innovation-agent, paper-writer | 6 |
| creative | creative-lead | creative-lead, writing-agent, editor-agent, ppt-agent, resume-agent | 5 |
| engops | engops-lead | engops-lead, project-health-agent, git-manager, release-agent, changelog-agent | 5 |
| advisory | solution-architect | solution-architect, requirement-agent, discussion-agent | 3 |
| pm | project-manager-agent | project-manager-agent, adr-recorder, project-knowledge-manager, task-memory-agent | 4 |

合计：**30 / 30**

## 不变量（org-1 ~ org-7）

- org-1：Agent 数量恒为 30，只建模不增删。
- org-2：每个 Agent 绑定恰好一个 primary team + 一个 role（30/30）。
- org-3：只建模 / 映射 / 查询 / 验证；不执行 / 不选 Agent / 不改 Prompt。
- org-4：`team-registry.yaml` 保持为 Runtime Registry，只增 `organization_ref`，不替代。
- org-5：Router 输出 `team_candidate / role_candidate / agent_candidates`（候选）。
- org-6：最终 Agent 决策仍归 **PM + Approval**。
- org-7：不自动新增 Team / Role，不自动替换 Agent，不自动调整组织结构。

## 集成

- **Router**：分类结果 → team_candidate → role_candidate[] → agent_candidates[]（候选，非最终选择）。
- **Capability**：Role → Capabilities → Agents 映射（不改 capability-registry）。
- **Collaboration**：handoff 增加 `from_team/to_team/from_role/to_role`（保留 `from_agent/to_agent`）。
- **Trace**：trace event.source（agent）经 binding 解析 `team_ref/role_ref`（经 metadata，不改 trace schema）；链路 Team → Role → Agent → Trace。

## CLI

```
myteam organization status            # Teams / Roles / Agents 概览
myteam organization trace AGENT_ID    # Agent -> Role -> Team
myteam organization validate          # schema / binding / registry / reference
```

## 硬性边界

禁止：自动新增 Team、自动新增 Role、自动替换 Agent、自动选择 Agent、自动修改 Prompt、自动调整组织结构。Organization Layer 只负责建模 / 映射 / 查询 / 验证。
