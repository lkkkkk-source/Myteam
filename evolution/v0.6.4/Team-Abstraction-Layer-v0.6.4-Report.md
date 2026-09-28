# Team Abstraction Layer v0.6.4 Report

> 阶段：v0.6.4 · Team Abstraction Layer
> 状态：抽象层 + 兼容层 + 迁移方案 已完成；未执行迁移

## 1. 当前 Team 问题分析

| 问题 | 表现 | 影响 |
|------|------|------|
| Team 硬编码 | Router rules R1-R6 写死 `java/research/creative/engops` | 新 team 需改 Router |
| registry 分散 | team 信息散在 capability registry / team-context / Lead prompt | 无单一权威 |
| Quality Rules 分散 | 质量规则藏在各 Lead prompt 正文 | 无法被统一读取 |
| 新增 team 成本高 | 需新增目录 + 规则 + context | 扩展慢 |
| Lead 命名不统一 | `advisory` 无 lead，`pm`、`creative` 与其他团队结构不同 | 结构不一致 |

## 2. Generic Team Schema

新增权威文件：`.ai/context/team-registry.yaml`

```yaml
teams:
  - id            # 唯一标识
    name          # 展示名
    lead          # Lead Agent
    specialists[] # 成员 Agent
    workflows[]   # 可执行 Workflow
    capabilities[] # 能力集合（Router 匹配用）
    quality_rules[] # 质量规则（Quality Gate 读取）
    status        # active / deprecated / reserved
    domain        # 领域标签（software-engineering / research / ...）
```

## 3. Team Registry 设计

- 6 个 team 已登记：`java / research / creative / engops / pm / advisory`
- 每个 team 含完整字段（lead / specialists / workflows / capabilities / quality_rules / status / domain）
- `capabilities[]` 与 `.ai/context/capability/agent-capabilities.yaml`（30 Agent）对齐
- 未来新增 team：只在 registry 添加条目，不改 Router / capability / context

## 4. Agent 解耦方案

- Agent 不再"属于"某个硬编码 team 字段决定路由；
- team 关系收敛到 registry（`specialists[]` + `lead`）；
- capability registry 的 `team` 字段保留为兼容视图（legacy），权威改为 team-registry；
- **本阶段不改 Agent 数量、不迁移、不重命名**。

## 5. Router 集成

两层路由（本阶段实现兼容层，未启用迁移）：

```
用户请求
  │
  ├─ 命中 legacy rules R1-R6（具体优先，兼容现状）
  │     → 选 team / lead / workflow
  │
  └─ 未命中（generic fallback，v0.6.4 设计）
        → 按 capability 匹配 team-registry
        → 选 team / lead / workflow
```

- R1-R6 保留原有行为，延续旧 workflow 路由。
- generic fallback 使用 `team-registry.yaml[id].capabilities` 与 `[id].lead` 自动路由，无需改规则。

## 6. Capability 集成

- `team-registry.yaml[id].capabilities` 为 Router generic 匹配源。
- capability registry（30 Agent）保持不动，兼容旧查询。
- 实际例：java 团队 capabilities=`[spring-boot, mybatis, java-core, tdd, sql, database]`，registry 已与 agent-capabilities.yaml 校验一致。

## 7. Prompt Evolution 集成

- 演进报告新增 v0.6.4 板块，外部仓库（264 agents）仍只读。
- v0.6.4 迁移提案建议在 `evolution/v0.6.4/migration-plan.md`（本阶段未执行）。
- 未来升级方向：team-context 目录 → registry 字段（v0.7 提案）。可从 registry capabilities 反向推导需求能力，匹配外部 agent capabilities。

## 8. 测试结果

| Case | 检查内容 | 结果 |
|------|----------|------|
| Case1 | 现有 Java Team 可映射到 Generic Team | PASS |
| Case2 | Router 根据能力找到 Team | PASS |
| Case3 | Agent Registry 保持 30 | PASS |
| Case4 | Prompt Evolution 可读取 Team 上下文 | PASS |
| Case5 | 旧 Workflow 继续工作 | PASS |
| Future-extend | 未来 Team 可扩展（registry 设计） | PASS |

**TOTAL: 6/6 passed**

## 9. 基线确认

| 项 | 要求 | 结果 |
|----|------|------|
| Agent | 30 | PASS |
| MCP | 5 | PASS |
| Skill | 26 | PASS |
| Workflow | 8 | PASS |
| Runtime 修改 | 禁止 | 未执行 |
| Agent 迁移 | 禁止 | 未执行 |
| 删除/重命名 Agent | 禁止 | 未执行 |

## 10. 交付清单

```text
.ai/context/team-registry.yaml              # Generic Team Model 唯一权威
evolution/v0.6.4/concept.md                 # 抽象层概念 + 兼容说明
evolution/v0.6.4/migration-plan.md          # 迁移方案（未执行）
evolution/v0.6.4/tests/run-v064-tests.ps1   # v0.6.4 测试
source/prompts/pm/project-manager-agent.md  # 支持 Generic Team 概念
source/prompts/leads/engops-lead.md         # 维护 Team Registry
source/prompts/engops/project-health-agent.md # 检查 Team Schema 一致性
```

## 最终目标达成

从"领域固定 Agent 组织" 升级为 "可扩展 Agent Organization Platform"：

未来支持 software-engineering / research / data / legal / finance / custom team 只需在 `team-registry.yaml` 添加条目 + registry 的 future 阶段补齐 Lead 与 context，无需重新设计架构。

## 本阶段边界（再次确认）

- 保留现有 java / research / creative / engops 组织
- 保留 R1-R6 legacy rules（Router 先走 legacy，兼容旧 workflow）
- 未删除任何 team、未修改 Agent 数量、未自动迁移、未改 runtime、未重命名、未替换 Prompt（仅按用户指定扩展 3 个 Agent 的认知字段）