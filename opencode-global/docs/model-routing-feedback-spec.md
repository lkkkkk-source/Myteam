# Model Routing Feedback Loop Spec（v0.6.9）

> 系统层能力，**不新增 Agent / Team / MCP / Skill**，不改 PM 与 Lead 职责，不改 Workflow 核心行为。
> 上游：v0.6.8 Model Routing Recommendation Layer（只推荐、不执行）。

## 0. 目标

将 **Model Recommendation** 升级为 **Model Recommendation Intelligence**：

- 系统能够「知道」**什么任务适合什么模型能力等级**（基于历史反馈沉淀知识）。
- 但仍保持：
  - **人工审核**（策略变更必须经 engops-lead proposal 审核）
  - **策略可追踪**（change_log / proposal 关联可回滚）
  - **不会自动改变行为**（feedback 只记录、metrics 只统计、analytics 只沉淀、proposal 只建议）

## 1. Feedback Architecture（反馈闭环）

```
Recommendation(history)
    │  任务执行（人工 / Agent 实际使用档位）
    ▼
Feedback(记录实际结果) ──► Metrics(聚合指标)
    │                          │
    │                          ▼
    └──► Analytics(findings: 任务↔档位适配知识)
                  │
                  ▼
        Improvement Proposal(draft)
                  │   engops-lead 人工审核
        ┌─────────┴─────────┐
        ▼                   ▼
     approved            rejected
        │                   │
   更新 routing-policy   policy 不变
   + change_log          (Case5)
```

数据流单向、只增：`feedback → metrics → analytics → proposal → (审核) → policy 变更`。任何一环都**不自动**改动策略，只能在最后通过 approved proposal 落地。

## 2. 目录与文件

| 资产 | 路径 | 职责 |
|---|---|---|
| Feedback Schema | `platform/model-routing/feedback/feedback-profile-schema.yaml` | 反馈记录字段 / 有效性判定 |
| Feedback History | `platform/model-routing/feedback/feedback-history.yaml` | 实际反馈记录（只记录） |
| Feedback Metrics | `platform/model-routing/feedback/metrics/feedback-metrics.yaml` | 反馈聚合指标 + insights |
| Feedback Analytics | `platform/model-routing/feedback/analytics/routing-feedback-analytics.yaml` | findings（任务↔档位适配知识） |
| Proposal Schema | `platform/model-routing/feedback/proposals/proposal-schema.yaml` | 改进提案字段 / 审核原则 |
| Improvement Proposals | `platform/model-routing/feedback/proposals/P-069-*.yaml` | 特定策略改进提案 |

## 3. Feedback 数据模型

反馈记录核心字段：`feedback_id / task_id / recommended_class / actual_used_class / outcome / quality_feedback{outcome_quality, match_verdict, issue_description} / needed_capability / human_confirm / recorded_by / recorded_at / reference`。

**match_verdict**（关键判定）：
- `good-fit`：档位与任务匹配良好
- `over-provisioned`：档位过强（高成本档位解决普通任务）
- `under-provisioned`：档位不足（任务超出该档位能力）
- `mismatch`：档位选择不合理

## 4. Analytics 设计

`routing-feedback-analytics.yaml` 汇总 `feedback-history + feedback-metrics`，输出：

- `findings`：每条含 `task_pattern / learned_class / confidence / evidence / action`，形成「任务类型 ↔ 推荐档位」知识（可追溯，只增不改）。
- `knowledge`：系统已能归纳任务↔档位适配关系，供人工与 proposal 审核参考。

## 5. Proposal 机制（改进提案）

**流程**：`feedback → analytics → proposal(draft) → engops-lead review → approved(release+change_log) / rejected(关闭，policy 不变)`。

- 单条 / 少量 `under-provisioned` 反馈**不足**以支撑全局档位上调（成本/风险考量，见 P-069-02 判例）。
- `approved` ��案 → 依发布流程更新 `routing-policy` 并追加 `change_log`，保证**可追踪、可回滚**。
- `rejected` 提案 → 关闭，`routing-policy` / `model-registry` **保持原样**。

## 6. 一致性检查（project-health-agent）

见 `source/prompts/engops/project-health-agent.md` 第 13 项，校验：
- feedback 引用 registry / history 一致
- metrics 汇总与 history 一致
- proposal 唯一 schema + 证据真实
- **不自动改变行为**：rejected proposal 不得留下策略变更；无绕过 proposal 直接改 policy 的证据；策略变更可追溯。

## 7. 硬性边界（强制）

- feedback / metrics / analytics **只读、只统计、只沉淀**，不自动改策略。
- 策略变更**唯一**入口 = improvement proposal + engops-lead 人工批准。
- 不自动切换模型 / Provider / 不自动调用模型；仅维护推荐策略元数据。
- 高风险（human_confirm=true）反馈未经人工确认不视为有效。
- 基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**（不新增 / 不删除 / 不修改核心行为）。
