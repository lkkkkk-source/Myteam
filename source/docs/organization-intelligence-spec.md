# Organization Intelligence Spec — v1.5

## 目标

让 MyTeam 从 **Agent Organization Model**（v1.4.3）升级为 **Self-Observing Agent Organization**（自观察组织）：

```
读取历史运行数据 → 分析组织运行状态 → 生成洞察 → 生成优化建议
```

**始终保持：Human Approval / Governance First / No Auto Modification。**

## 核心原则

Organization Intelligence 层 **只分析 / 只报告 / 只建议**（oi-1~oi-7）：

- 只读历史数据，不修改任何来源数据（read-only）。
- **不自动**修改 Agent / 新增 Team / 删除 Role / 调整 Workflow / 改 Prompt / 改 Router Rules / 改 Model Routing / 执行 Recommendation。
- 所有 Recommendation 必须经 `draft → review → approved/rejected` 人工审批。
- 面向流程与组织，**不评价个人**，禁止 Agent 排名（无 `best_agent` / `worst_agent`）。
- 每条 insight / recommendation 必须带 `evidence_refs`。

## 目录

`platform/organization-intelligence/`

```
organization-intelligence/
├── intelligence-schema.yaml          # intelligence_id/time_range/scope/source_refs/metrics/insights/recommendations + oi-1..oi-7 + forbidden
├── metrics/
│   ├── team-performance.yaml         # tasks/success/first_pass/cycle_time/handoff/conflict (团队级，不评分 Agent)
│   ├── role-performance.yaml         # handoff_quality/rework/quality_pass/cycle_time (流程瓶颈)
│   ├── agent-performance.yaml        # usage/task_types/success/failure_patterns/capability_usage (禁止排名)
│   ├── collaboration-metrics.yaml    # handoff/conflict/decision
│   └── workflow-metrics.yaml         # phase duration/bottleneck/failure point (来源 Trace)
├── analysis/
│   ├── bottleneck-analysis.yaml      # finding + evidence_refs (禁止直接改 workflow)
│   ├── failure-patterns.yaml         # 重复失败/阻塞/安全升级/handoff失败 + frequency + evidence
│   ├── success-patterns.yaml         # 成功流程模式 (只记录)
│   └── workload-analysis.yaml        # team/role 负载分布
├── recommendations/
│   ├── recommendation-schema.yaml    # id/source_metrics/evidence_refs/suggestion/risk/status
│   └── recommendation-records.yaml   # RECO-* (全部 draft)
├── reports/
│   └── organization-intelligence-report.yaml
└── tests/
    └── intelligence-test.ps1
```

状态台账：`.ai/context/organization-intelligence/intelligence-state.yaml`

## 数据来源（只读，禁止修改）

| 来源 | 内容 |
|------|------|
| v1.4.3 Organization | team / role / agent binding |
| v1.4.1 Trace | lifecycle events / duration / failures |
| v1.4 Collaboration | message / handoff / decision / conflict |
| v1.3 Workspace | changes / checkpoints / merge |
| v1.2 Execution | execution result / retry / failure |
| v1.4.2 Safety | blocked / escalation / violations |
| v0.6 Analytics | success rate / quality metrics |

## CLI

```
myteam intelligence status            # 分析状态
myteam intelligence report            # 组织分析报告
myteam intelligence bottlenecks       # 瓶颈分析
myteam intelligence recommendations   # 建议列表 (全部 draft)
myteam intelligence validate          # schema / reference / boundary
```

## 硬性边界

禁止：自动修改 Agent、自动新增 Team、自动删除 Role、自动调整 Workflow、自动修改 Prompt、自动改 Router Rules、自动改 Model Routing、自动执行 Recommendation、生成 Agent 排名。Intelligence 层只观察、分析、报告、建议。
