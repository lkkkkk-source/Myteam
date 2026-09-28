# research-paper（科研论文全流程）

## 使用场景
- 从研究问题到论文初稿
- 完整科研闭环（文献 → 分析 → 创新 → 实验 → 写作）

## 输入
- 研究问题 / 领域方向
- 可选：已有文献清单、期望产出形式（投稿/报告）

## 调用 Agent 顺序
> **入口：`research-lead` 负责按本流程编排**（PM 分派任务到 research-lead，Lead 协调以下 Agent）。

1. **literature-agent** — 检索、阅读、总结相关论文
   - 输出：文献清单 + 方法总结 + 真实引用
2. **research-analyst** — 前沿分析、识别研究空白
   - 输出：领域地图 + 空白清单 + 方向优先级
3. **innovation-agent** — 提出创新点与可验证假设
   - 输出：创新设计文档（含假设 + 可行性）
4. **experiment-agent** — 设计方法、实验矩阵、指标、复现说明
   - 输出：实验方案
5. **paper-writer** — 撰写各章节 + 核实引用
   - 输出：论文初稿
6. **research-lead** — 汇总研究结论回报 PM

## 并行协作
- 不同子主题文献检索可并行（多 literature-agent 分派）
- 论文各章节可并行起草后合并

## 迭代规则
- 创新假设被后续实验推翻 → 回到 innovation-agent 重新设计
- 论文引用被核对失败 → literature-agent 补充检索
- experiment-agent 发现创新点不可实现 → 回到 innovation-agent

## 跳过规则
- 问题已有明确创新点（无需探索）：跳过 research-analyst
- 已有完整文献综述：跳过 literature-agent
- 仅写某章节（非全流程）：仅调用 paper-writer

## 输出要求
- 文献总结（含真实引用）
- 前沿分析（空白清单）
- 创新点（假设 + 可行性）
- 实验方案（方法/数据集/指标/复现说明）
- 论文结构（Abstract / Intro / Related Work / Method / Experiment）

## 结束条件
- 所有引用可溯源、未编造
- 方法描述与实验实现一致
- 假设可证伪、有对照

## 不适用
- 单篇论文精读 → 仅调用 literature-agent
- 只做方法设计 → 仅调用 experiment-agent