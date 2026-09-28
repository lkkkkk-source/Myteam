# Task Plan Specification

> Lead 层使用的任务计划规范。把 PM 的拆解转成 Lead 可编排、Agent 可逐步执行的步骤。

## 位置
`.ai/tasks/{task_id}/task-plan.yaml`（任务粒度一个文件）

## 与 Context 的关系
- Context（`current-task.yaml`）放**状态与指针**；Task Plan 放**执行步骤正文**
- Lead 更新 `current-task.yaml` 的 `task_plan` 指针指向本文件

## 文件结构（YAML）
```yaml
version: 1
task_id: "refund-feature"
steps:
  - id: step-1
    name: "架构分析"
    agent: "java-architect"
    depends_on: []                 # 依赖其他步骤 id
    inputs:
      - "requirements.acceptance"
      - "knowledge/architecture.md"
    outputs:
      - "artifacts/architecture/refund-feature-architecture.md"
    status: done                   # pending / in-progress / done / blocked
    notes: ""

  - id: step-2
    name: "开发计划"
    agent: "java-planner"
    depends_on: ["step-1"]
    inputs:
      - "artifacts/architecture/refund-feature-architecture.md"
    outputs:
      - "task-plan.yaml#step-3..6"   # 细化子步骤
    status: pending

  - id: step-3
    name: "实现退款接口"
    agent: "java-developer"
    depends_on: ["step-2"]
    inputs: []
    outputs:
      - "artifacts/code/refund-feature/"
    status: pending
    parallel_group: A               # 并行组：同一组可并行执行

  - id: step-4
    name: "实现状态机扩展"
    agent: "java-developer"
    depends_on: ["step-2"]
    inputs: []
    outputs:
      - "artifacts/code/refund-feature/"
    status: pending
    parallel_group: A

  - id: step-5
    name: "代码审查"
    agent: "java-reviewer"
    depends_on: ["step-3", "step-4"]
    inputs:
      - "artifacts/code/refund-feature/"
    outputs:
      - "artifacts/review/refund-feature-review.md"
    status: pending

  - id: step-6
    name: "测试验证"
    agent: "java-tester"
    depends_on: ["step-5"]
    inputs:
      - "artifacts/code/refund-feature/"
    outputs:
      - "artifacts/review/refund-feature-test.md"
    status: pending
```

## 规则
1. **步骤粒度**：一个 Agent 一次调用 = 一个 step；过大则拆
2. **依赖**：`depends_on` 决定串行；`parallel_group` 决定可并行批次
3. **状态流转**：pending → in-progress → done / blocked
4. **禁止跳步**：步骤的 `depends_on` 未 done，不得进入 in-progress
5. **暂停/继续**：Lead 在 `current-task.yaml` 记录 `resume_point.step`，恢复时从该 step 重入
6. **产物**：每步 `outputs` 必须真实存在；Agent 结束前检查产物是否落地
7. **异常**：step 置 blocked 并写 notes，交由 Lead 处理（重试 / 换 Agent / 上报 PM）
8. **并行**：同一 `parallel_group` 且相互无依赖的步骤，Lead 可用 `dispatching-parallel-agents` 分发
