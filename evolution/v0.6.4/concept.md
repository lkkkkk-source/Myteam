# Team Abstraction Layer (v0.6.4) — 概念与兼容说明

## 目标
将硬编码的领域化 Team 组织，抽象为 **Generic Team Model**，使新增 team
（software-engineering / data / legal / finance / custom …）不需要修改 Router rules、
Capability registry、Context、Workflow，只需在 Team Registry 中添加条目。

## 现状问题（分析）
1. Router rules（`.ai/context/router/rules/routing-rules.yaml`）硬编码 `java/research/creative/engops` 四个 team。
2. Capability registry（`agent-capabilities.yaml`）每 agent 带 `team:` 字段，但 team 语义分散。
3. 各 Team context（`.ai/context/teams/*/team-context.md`）为固定目录，新增 team 需新增目录。
4. Quality Rules 未结构化：分散在 Lead prompt 中，无法被 Router/Registry 统一读取。

## 抽象模型
```
Generic Team Model
├── id                        (team 唯一标识)
├── name                      (展示名)
├── lead                      (Lead Agent)
├── specialists[]             (成员 Agent)
├── workflows[]               (可执行 Workflow)
├── capabilities[]            (能力集合，供 Router 匹配)
└── quality_rules[]           (质量规则，供 Quality Gate 读取)
```

## 兼容层设计（不破坏现状）
- Team Registry 新增文件：`.ai/context/team-registry.yaml`（Generic 源）
- 旧文件**保持不动**（router rules / capability / team-context / Lead prompt）
- 兼容策略：
  - Router 规则 R1-R6 保留，作为"具体优先"匹配
  - 新增 `generic` fallback：未命中具体规则 → 按 capability 匹配 team-registry → 选 team
  - Capability registry 保留 30 agent / team 字段（兼容旧查询）
  - 新增 team 时：只改 team-registry.yaml，Router fallback 自动可用

## 三层设计
1. **抽象层（Generic）**：`.ai/context/team-registry.yaml` — 唯一权威
2. **兼容层（Legacy）**：router rules / capability registry / team-context — 只读兼容
3. **迁移层（Future）**：本阶段不执行；提案记录在 `proposals/` 中

## 未来扩展示例
```yaml
# 新增 data team 仅需：
- id: "data"
  lead: "data-lead"
  specialists: ["data-engineer", ...]
  workflows: ["data-pipeline", ...]
  capabilities: ["etl", "analytics", ...]
  quality_rules: [...]
```
Router 通过 capability 匹配即可路由到 data team，无需改 R1-R6。

## 本阶段范围
- 只做抽象层 + 兼容层 + 迁移方案。
- 不删除现有 Team、不修改 Agent 数量、不自动迁移、不改 runtime、不重命名、不替换 prompt。
