# Production Guard Spec（v1.4.2）

> 与 `runtime-safety-spec.md` 配套：Safety 定义"安全机制"，本文聚焦**生产环境守护**的场景与流程。

## 0. 目标

让 MyTeam 在接近生产运行时具备"刹车"：任何可能失控（预算爆炸 / 无限循环 / 超时 / 高风险变更）的场景都会被**检测 → 限制 → 阻断 → 升级人工确认**，绝不失控自动放行。

## 1. 生产守护场景

| 场景 | 触发 | 守护动作 |
|---|---|---|
| 预算超限 | token / cost > limit | waiting-human（禁止自动扩预算）|
| 重复失败 | retry 达上限 | blocked → Recovery / human |
| 无限循环 | 重复 action / 相同失败 / handoff 循环 | suspected-loop → blocked |
| 执行超时 | > 30m | blocked → Recovery |
| 高风险变更 | production deploy / db schema / security | human_required（必须人工确认）|

## 2. 守护流程

```
Action Proposal
  ↓
Safety Check (budget/limit/loop/timeout/escalation)
  ↓ status
  normal      → Approval → Execution Engine
  warning     → 记录，视 policy 继续
  blocked     → 拒绝执行（Recovery / human）
  human_required → 人工确认 → Approval → Execution Engine
```

## 3. 与执行链的关系

- **Execution Engine 执行前必须读 safety status**（sf-5）：blocked 拒绝、human_required 等待。
- Safety 不替代 Approval：即使 safety normal，仍需 action approved + permission granted（v1.2 ee-1/ee-2）。
- 高风险人工确认 + Action Approval 是**两道独立门**，都需通过。

## 4. 可控性四支柱

MyTeam 至此具备：**可观察（trace）· 可协作（collaboration）· 可执行（execution engine）· 可控制风险（safety）**。

## 5. 硬性边界（强制）

Production Guard 只加"刹车"，不改"方向盘"：不改 Router / Agent Selection / Model Routing / Execution Policy / Quality Gate；不自动提权 / 扩预算 / 改策略 / 跳过人工确认。
基线保持：**Agent=30 · MCP=5 · Skill=26 · Workflow=8**。
