# Organization Insight Spec — v1.5

洞察与建议的产出规范。所有 insight / recommendation **必须可追溯**（`evidence_refs`），并遵守治理边界。

## Insight（洞察）

- 来自 metrics（team/role/agent/collaboration/workflow）与 analysis（bottleneck/failure/success/workload）。
- 面向 **流程与组织**，不评价个人；不产生 Agent 排名。
- 每条 insight 带 `evidence_refs`，指向真实来源（如 `TR-0001#EV-0009`、`HO-0002`、`SF-0003`、`gate-state#validation`）。

### 洞察类别

| 类别 | 示例 | 证据来源 |
|------|------|----------|
| Team insight | software-engineering 负载最高（tasks_per_agent 17.1） | team-performance / workload-analysis |
| Role insight | reviewer rework_rate 0.18 + cycle_time 上升 → 瓶颈信号 | role-performance / trace |
| Collaboration insight | tester→reviewer handoff success 最低（0.88） | collaboration-metrics / handoff-history |
| Bottleneck | review_delay（review 阶段耗时上升） | workflow-metrics / trace |
| Failure pattern | integration-testing 首用失败 | gate-state / analytics |
| Success pattern | architect→developer→tester 提升 first_pass_rate | trace / handoff-history |

## Recommendation（建议）

结构（`recommendation-schema.yaml`）：`id / source_metrics / evidence_refs / suggestion / risk / status`。

### 状态机（人工审批）

```
draft ──(人工审阅)── review ──(人工决策)── approved
                                     └────── rejected
```

- 生成即 `draft`；**只能人工推进状态**。
- `approved` **也不自动执行**：执行是独立的人工动作。
- **禁止**：`auto_apply` / `auto_modify` / `auto_execute`；禁止直接进入 source。

### 当前建议（示例，全部 draft）

| id | risk | suggestion（摘要） |
|----|------|------|
| RECO-0001 | low | review 前自检清单（人工评估，不自动改 workflow） |
| RECO-0002 | medium | developer→tester 前补集成测试样例（仅建议） |
| RECO-0003 | low | software-engineering 负载评估（不自动重分配 / 不新增 Agent） |
| RECO-0004 | low | java-tester 未用能力声明评估（不自动精简 / 不改 Prompt） |

## 治理保证

- **Human Approval**：所有建议需人工审批。
- **Governance First**：不绕过 Approval / Execution Engine。
- **No Auto Modification**：不修改 Agent / Team / Role / Workflow / Prompt / Router / Model Routing。
- **Baseline**：Agent=30 / MCP=5 / Skill=26 / Workflow=8 不变。
