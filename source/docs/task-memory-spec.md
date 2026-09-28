# Task Working Memory Specification (v0.4.2)

> 系统从"依赖聊天上下文的 Agent"升级为"**依赖结构化 Task Memory 执行的 Agent**"。
> Task Memory 是**任务级工作记忆**：把目标 / 进度 / 已定决策 / 下一步固化成结构化文件，
> 使 Agent 在**新会话、上下文被压缩、跨 Agent 交接**时仍能无歧义恢复执行。

## 1. 定位与三层记忆模型
| 层 | 载体 | 生命周期 | 回答什么 |
|----|------|---------|---------|
| **工作记忆（本层）** | `.ai/context/memory/task-memory.yaml` | 任务期内活跃，任务完成后**归档保留** | "我现在该做什么、为什么" |
| 情景记忆 | handoff_log / scheduler/decision-log | 任务期内 | "发生过什么" |
| 长期记忆 | `.ai/knowledge/`（ADR / 架构 / 踩坑） | 跨任务持久 | "项目永远的事实" |

> 边界原则：**Task Memory ≠ Knowledge**。Task Memory 是"本任务当前该怎么走"（随任务变化）；
> Knowledge 是"项目长期不变的事实与决策"（跨任务沉淀）。二者通过"归档时产生 knowledge 候选"单向连接。

## 2. 目录结构
```
.ai/context/memory/
├── task-memory.yaml            # 当前任务工作记忆（唯一，PM 维护）
└── archive/
    └── {task_id}.yaml          # 任务完成后归档的 Task Memory（保留，供追溯）
```

## 3. Task Memory 数据结构
`task-memory.yaml`：
```yaml
version: 1
task_id: "refund-feature"
updated_at: "2026-09-20T13:50:00"

# ① 目标（恢复即知"为什么做"）
goal:
  summary: "给订单系统增加退款功能"
  acceptance: ["退款接口返回新状态", "状态机含 REFUNDING/REFUNDED", "退款记录落库"]

# ② 进度快照（恢复即知"做到哪"）
progress:
  completed: ["architecture", "coding(step-2)"]
  current: "step-3a/3b 并行编码"
  next: "step-4 集成测试"

# ③ 已定决策（防止反复讨论，Case2 核心）
decisions:
  - id: "td-001"
    topic: "退款数据建模"
    choice: "退款独立表（refund_record）"
    reason: "与订单解耦，支持部分退款与状态回查"
    decided_at: "2026-09-20T13:02:00"
    decided_by: "java-planner"

# ④ 恢复指令（Agent 启动第一步读这里）
resume_directive: "读 progress.current → 执行 step-3a/3b；勿重议 decisions"

# ⑤ 归档指针（任务完成后填）
archive_ref: null
knowledge_candidates: []        # 归档时产生的"可沉淀为 Knowledge"候选
```

## 4. 与 Context / Knowledge 的边界
- **写入方**：仅 **task-memory-agent**（记忆管家）维护 `task-memory.yaml`；其余 Agent 只读
- **读取方**：任何 Agent 启动 / 恢复时第一步读 `memory/task-memory.yaml`（尤其 `resume_directive`）
- **与 Context 的关系**：task-memory 是 Context 的"浓缩视图"，指向 current-task / task-plan / scheduler 详情，不复制其内容
- **与 Knowledge 的关系**：任务完成归档时，task-memory-agent 提炼 `knowledge_candidates`（如"退款独立表建模"经验）交 **project-knowledge-manager** 决定是否入库

## 5. 与 Scheduler 的集成
- Scheduler 产出 decision 后 → task-memory-agent 把"下一步建议"写进 `progress.next` + `resume_directive`
- Agent 恢复时先读 task-memory（目标/进度/已定决策），**再**按 scheduler execution-plan 执行
- 失败反馈 → task-memory 的 `progress` 回退 + `resume_directive` 更新为"先走 Recovery"

## 6. Agent 职责
- **task-memory-agent（新增，memory curator）**：维护 task-memory.yaml；决策写入 / 归档 / 提炼 knowledge 候选
- **PM / Lead**：决策或进度变化时通知 task-memory-agent 更新；恢复时读 task-memory
- **执行 Agent**：启动读 task-memory（`resume_directive`），避免重新讨论已定 decisions

## 7. 本次不实现
- 自动记忆更新（仍由 task-memory-agent 手动/触发式更新）
- 记忆向量检索 / 跨任务记忆图谱（后续版本）
