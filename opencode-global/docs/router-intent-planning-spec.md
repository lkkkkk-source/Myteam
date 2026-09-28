# Intent Analysis & Project Planning v0.6.1 Spec

> PM/Router 能力升级：从"分类→路由"扩展为"理解→规划→路由→执行"。
> 不新增 Agent，不新增 Team，不自动选执行 Agent。

## 1. Intent Analysis

复用 **`discussion-agent`**（已有 Agent，v0.6 基线内）作为 Intent Analysis 的底层执行者。

### 1.1 流程

```
用户输入（模糊 / 口语化）
        ↓
PM/Router 调用 discussion-agent（advisory，只读）
        ↓
discussion-agent 输出 Intent Analysis（YAML 结构）
        ↓
PM/Router 写入 .ai/context/router/intent/{task_id}-intent.yaml
        ↓
PM/Router 做 Classification（v0.6 流程，不变）
        ↓
PM/Router 制定 Project Plan
```

### 1.2 Intent 输出结构

```yaml
# .ai/context/router/intent/{task_id}-intent.yaml
task_id: "..."
source: "user"
raw_input: "用户原始描述"
intent:
  goal: "核心目标（一句话）"
  success_criteria:
    - "可验证的完成标准 1"
    - "可验证的完成标准 2"
  scope:
    in:
      - "明确包含的内容"
    out:
      - "明确排除的内容"
  constraints:
    - "时间 / 资源 / 技术约束"
  open_questions:
    - "需要用户回答的疑问（若已有默认假设则标注 assumed=true）"
assumptions:
  - text: "假设内容"
    risk: low | medium | high
    source: "discussion-agent"
confidence: high | medium | low
  # 高：目标清晰、假设少
  # 中：有 1-2 个待澄清问题
  # 低：需先跑 advisory workflow 再继续
advisory_needed: false  # true → PM 先 dispatch advisory workflow
```

### 1.3 边界

- `discussion-agent` 只读，**不写任何文件**；输出由 PM/Router 整理写入 intent 文件
- Intent 分析**替代**"需求澄清"阶段，而非追加；PM 不再单独向用户问一轮（除非 confidence=low）
- 用户输入已足够清晰（如"实现退款接口"）→ PM 可跳过完整 discussion-agent 流程，直接写 intent（confidence=high）

## 2. Project Plan

PM/Router 在 intent 之后生成**阶段级**计划，**不生成 Agent step**。

### 2.1 结构

```yaml
# .ai/context/router/plans/{task_id}-project-plan.yaml
task_id: "..."
version: 1
status: draft | active | superseded | completed
intent_file: ".ai/context/router/intent/{task_id}-intent.yaml"
route_file: ".ai/context/router/routes/{task_id}-route.yaml"
goal: "来自 intent.goal"
milestones:
  - id: "M1"
    title: "阶段名（业务/可交付物视角）"
    deliverables:
      - "具体可验收的产出"
    teams:
      - "java"
    acceptance: "完成判定标准（一句话）"
    dependencies:
      - "M0"
    owner: "java-lead"   # Lead 级，不是 Agent 级
    status: pending       # pending | in-progress | done | blocked
milestone_policy:
  cross_team: "若跨团队，milestone 必须声明依赖顺序"
  approval: "高风险 milestone 执行前须 PM 审批（对接 Scheduler approval-queue）"
```

### 2.2 规则

| 规则 | 说明 |
|------|------|
| 阶段粒度 | 3-6 个 milestone；每个 = 一个可交付物或团队责任块 |
| 不含 Agent | `owner` 必须是 Lead；不出现 java-architect / java-developer 等具体 Agent |
| 依赖声明 | `dependencies` 声明 milestone 间顺序；**Scheduler 负责拆解执行顺序** |
| 变更追踪 | 每次修改 plan 更新 `version` + 在 `router/history/` 写 planning-history 条目 |
| 与 Scheduler 衔接 | `route_file` + `plans/{task_id}-project-plan.yaml` 作为 Scheduler 输入 |

### 2.3 与 Scheduler 的边界（强制）

```
Router 职责（本层）          Scheduler 职责（下游）
─────────────────────      ─────────────────────
Intent 分析                 执行拆解（DAG 生成）
Classification              步骤拆分（milestone → steps）
Project Plan（阶段级）      并行/串行决策
Route（team/lead/workflow） 风险/审批/依赖解析
Milestone 定义             Agent step 生成
```

**Router 输出中禁止出现**：`steps`、`agent_assignments`、`parallel_groups`、`runtime_schedule`。

## 3. Context 集成

`current-task.yaml` 新增字段：

```yaml
# v0.6.1 规划层指针
router_intent: ".ai/context/router/intent/{task_id}-intent.yaml"
router_plan: ".ai/context/router/plans/{task_id}-project-plan.yaml"
router_history: ".ai/context/router/history/"
router_milestones: ".ai/context/router/milestones/"
```

## 4. Memory 集成

任务恢复时，`memory/task-memory.yaml` 的 `resume_point` 必须包含：

```yaml
resume_point:
  router_state: "milestone_id + status"   # 恢复到哪个 milestone
  plan_version: 2                         # 使用的 plan 版本
  intent_confidence: "high"               # 是否需要重跑 intent 分析
```

## 5. 测试用例

| Case | 验证点 |
|------|--------|
| 1 | 模糊输入 → discussion-agent 输出 intent（confidence 合理） |
| 2 | 跨团队任务 → plan 声明 team + 依赖，不含 Agent |
| 3 | 任务恢复 → memory resume_point 含 milestone_id |
| 4 | Router 输出检查 → 无 `steps` / `agent_assignments` 字段 |
| 5 | 计划变更 → planning-history 记录 diff（版本号 +1） |
