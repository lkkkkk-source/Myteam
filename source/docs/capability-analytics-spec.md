# Capability Analytics Specification (v0.5.1)

> 系统从"**知道有哪些能力**"升级为"**知道这些能力实际运行效果如何**"。
> Capability Analytics 是**能力分析层**：从 capability-feedback（v0.5）+ observability 数据（v0.4.4）汇总出
> usage / failure / success 率、Agent Performance、Capability Trend、Analytics Report。
> **只分析历史数据，不做 Agent Selection**（Selection 禁止；Recommendation 是下一阶段 v0.5.2）。

## 1. 定位与边界
- **输入**：只读
  - `capability/capability-feedback.yaml`（v0.5 反馈记录）
  - `observability/metrics/task-metrics.yaml` + `observability/failures/` + `observability/history/`
  - `capability/agent-capabilities.yaml`（声明能力，用于声明 vs 实际对比）
- **输出**：`analytics/` 下的 metrics / agents / trends / reports
- **只分析，不决策**：不自动选 Agent / 不自动调整 Scheduler / 不修改 Prompt / 不修改 Skill
- **不自动打分替换**：仅给"实际运行效果"数据，供 v0.5.2 Recommendation（只生成推荐）使用

## 2. 目录结构
```
.ai/context/analytics/
├── metrics/
│   ├── capability-metrics.yaml       # 能力级指标（usage_count / failure_count / success_rate / quality_pass_rate）
│   └── agent-performance.yaml        # Agent 性能（每 Agent：used / success / first_pass_rate / rework_rate）
├── agents/
│   └── {agent}-analytics.yaml        # 单 Agent 分析（声明 vs 实际）
├── trends/
│   └── capability-trend.yaml         # 能力趋势（连续任务数据）
└── reports/
    └── analytics-report.yaml         # Analytics 报告（汇总 + insights + recommendations）
```

## 3. Metrics 设计
`metrics/capability-metrics.yaml`：
```yaml
version: 1
updated_at: "2026-09-20T15:30:00"
capabilities:
  - capability: "spring-boot"
    usage_count: 2               # Case1：能力被使用次数
    failure_count: 0             # Case2：能力相关失败次数
    success_rate: 1.0
    quality_pass_rate: 1.0       # Case3：关联 Gate 通过率
  - capability: "integration-testing"
    usage_count: 1
    failure_count: 1
    success_rate: 0.0
    quality_pass_rate: 0.75
```

## 4. Agent Performance 设计
`metrics/agent-performance.yaml`（每 Agent 汇总）：
```yaml
version: 1
updated_at: "2026-09-20T15:30:00"
agents:
  - agent: "java-developer"
    tasks_used: 1
    steps_completed: 3
    recovery_used: 1
    rework_count: 1
    first_pass_rate: 0.75
    capabilities_used: ["spring-boot", "tdd", "mybatis"]
    capabilities_declared: ["spring-boot", "mybatis", "java", "tdd", "sql", "rest-api"]
    unused_capabilities: ["java", "sql", "rest-api"]   # 声明但未用（Case5 对比）
  - agent: "java-tester"
    tasks_used: 1
    steps_completed: 1
    first_pass_rate: 0.5
    capabilities_used: ["unit-testing", "integration-testing"]
    capabilities_declared: ["unit-testing", "integration-testing", "validation-gate", "browser-testing", "e2e-testing", "mvn", "test-report"]
    unused_capabilities: ["validation-gate", "browser-testing", "e2e-testing", "mvn", "test-report"]
```

## 5. Trend 设计
`trends/capability-trend.yaml`（连续任务数据 → 趋势）：
```yaml
version: 1
updated_at: "2026-09-20T15:30:00"
trends:
  - capability: "tdd"
    series:
      - task_id: "task-001"
        success_rate: 1.0
      - task_id: "task-002"
        success_rate: 1.0
      - task_id: "refund-feature"
        success_rate: 1.0
    direction: "stable"
    note: "连续 3 任务 success_rate=1.0"
  - capability: "integration-testing"
    series:
      - task_id: "refund-feature"
        success_rate: 0.0
    direction: "watch"
    note: "仅 1 次数据，失败 1 次，需观察"
```

## 6. Report 设计
`reports/analytics-report.yaml`（汇总 + 洞察 + 建议，**只建议不执行**）：
```yaml
version: 1
generated_at: "2026-09-20T15:30:00"
summary:
  capabilities_tracked: 2
  agents_analyzed: 2
  overall_success_rate: 0.75

insights:
  - "spring-boot 使用 2 次全成功，质量稳定"
  - "integration-testing 首用即失败（refund step-4），需重点观察"
  - "java-tester 声明 7 项能力实际只用 2 项（声明冗余）"

recommendations:
  - "v0.5.2 Recommendation：integration-testing 相关任务优先补充 debugger 支持"
  - "java-tester 声明能力可精简（仅记录，不自动修改）"
```

## 7. Observability 集成（单向）
- engops-lead（主观察者）在任务完成后：
  1. 追加 `capability/capability-feedback.yaml`（v0.5）
  2. **同步更新 `analytics/metrics/capability-metrics.yaml`（usage_count / failure_count / quality_pass_rate）**
  3. 更新 `analytics/metrics/agent-performance.yaml`
  4. 更新 trend series + 重新生成 analytics-report
- Analytics 只读 Observability / Capability Registry，**不改二者本体**

## 8. Agent 修改（不新增）
- **engops-lead**：职责扩展——任务完成后除 observability 外，同步写 analytics 四类文件
- **task-memory-agent**：归档前读 analytics-report 作为归档 metadata 参考指标（只读）
- **PM**：可读 analytics-report 了解能力实际效果（只读）
- 不新增 Agent / 不改 prompt 之外内容

## 9. 测试 case
| Case | 场景 | 验证 |
|------|------|------|
| 1 | 能力使用 | usage_count 增加 |
| 2 | 任务失败 | failure_count 增加 |
| 3 | Quality Gate 结果反馈 | quality_pass_rate 更新 |
| 4 | 连续任务数据 | trend 生成 |
| 5 | 声明能力 vs 实际能力 | registry 和 analytics 可对比 |

## 10. 本阶段不实现
- Agent Selection（自动选择）
- 自动修改 Prompt / Skill
- 自动调整 Scheduler
- v0.5.2 Capability Recommendation（只生成推荐）——下一阶段
