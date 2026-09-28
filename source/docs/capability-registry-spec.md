# Capability Registry Specification (v0.5)

> 系统从"固定 Agent 编排"升级为"**基于能力查询的智能编排基础**"。
> Capability Registry 是**统一能力索引层**：回答"谁有什么能力 / 哪个 Skill 提供什么能力 / 哪个 MCP 支持什么能力"。
> **只负责查询能力，不决定执行**（执行决策仍归 Scheduler + Approval + Gate 判定）。

## 1. 定位与边界
- **只查询，不执行**：Registry 提供能力查找 / 匹配，**不自动选择 Agent / 不自动调度 / 不自动替换**
- **不做打分 / 排名**：Capability Scoring / Agent Selection 是下一阶段（评估中，本阶段不实现）
- **不作为 Global Memory**：Registry 是静态索引 + feedback 增量记录，不替代 task-memory / knowledge
- 与 Observability 单向集成：任务完成后写 `capability-feedback`，供未来打分用

## 2. 目录结构
```
.ai/context/capability/
├── agent-capabilities.yaml      # Agent 能力索引（30 Agent）
├── skill-registry.yaml          # Skill 能力索引（26 Skill）
├── mcp-registry.yaml            # MCP 能力索引（5 MCP）
├── capability-feedback.yaml     # 能力反馈（只增，来自 Observability）
└── tests/                       # 5 个测试 case
```

## 3. Agent Capability 设计
`agent-capabilities.yaml`（每个 Agent 一条，字段固定）：
```yaml
version: 1
updated_at: "2026-09-20T15:00:00"
agents:
  - agent: "java-developer"
    team: "java"
    role: "执行"
    capabilities:
      - "spring-boot"
      - "mybatis"
      - "java"
      - "tdd"
      - "sql"
    skills_used: ["test-driven-development", "subagent-driven-development"]
    mcp_used: ["context7", "sequential-thinking", "memory"]
```

## 4. Skill Registry 设计
`skill-registry.yaml`（每个 Skill 一条）：
```yaml
version: 1
updated_at: "2026-09-20T15:00:00"
skills:
  - skill: "test-driven-development"
    provides: ["tdd", "test-first", "unit-testing"]
    agents_using: ["java-developer", "java-tester"]
```

## 5. MCP Registry 设计
`mcp-registry.yaml`（每个 MCP 一条）：
```yaml
version: 1
updated_at: "2026-09-20T15:00:00"
mcps:
  - mcp: "playwright"
    provides: ["browser-testing", "e2e-testing", "ui-automation"]
    agents_using: ["java-tester"]
    capabilities: ["browser-testing", "e2e-testing"]
```

## 6. Scheduler 集成（只查询，不决定）
- Scheduler 拆分任务时，生成 required capabilities 列表（写 `runtime/`，不写本层）
- **需要人 / PM 决策**：给定 required capabilities，Registry 返回候选 Agent（`matches`），**由 PM + Approval 决定执行者**
- 禁止：Registry 直接选 Agent / 自动调度

## 7. Observability 反馈（单向）
- 任务完成后，engops-lead 依据 `observability/metrics/task-metrics.yaml` + failure-analysis 追加 `capability-feedback.yaml` 记录
- 字段：task_id / agent / capability / used / success（observed from observability）
- feedback 是增量记录，供未来 Capability Scoring（下一阶段）使用

## 8. Task Memory 集成
- task-memory.yaml 增加 `required_capabilities` 块（任务拆解产物），归档时连同 feedback 一起留档

## 9. 测试 case
| Case | 查询 | 验证 |
|------|------|------|
| 1 | required capability "java" | 返回候选 Agent（java-developer / java-tester / ...） |
| 2 | 浏览器测试能力 | 返回 playwright MCP |
| 3 | 任务"开发退款功能" | 生成 required capabilities，**不自动选 Agent** |
| 4 | 任务完成 | capability-feedback 生成 |
| 5 | 声明 vs Observability 对比 | 历史数据可查询 |

## 10. 本阶段不实现
- Capability Scoring（打分）
- Agent Selection（自动选择 / 替换）
- 自动调度执行
- Global Memory
