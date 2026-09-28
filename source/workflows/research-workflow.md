# 科研研究工作流

> 从研究问题到论文初稿的完整科研流程。
> **入口：`research-lead` 负责按本流程编排**（PM 分派任务到 research-lead）。

## 流程总览

```
问题
 ↓
文献调研      → literature-agent
 ↓
前沿分析      → research-analyst
 ↓
创新点        → innovation-agent
 ↓
方法设计      → experiment-agent
 ↓
实验设计      → experiment-agent
 ↓
论文写作      → paper-writer
```

## 阶段说明

### 1. 问题输入
- 输入：研究问题、领域、约束
- 模糊时调用 `scientific-brainstorming` 澄清

### 2. 文献调研（literature-agent）
- 多源搜索论文、精读、总结方法
- 调用 `literature-review` 做系统综述
- 使用 `fetch` 抓取、`memory` 建论文图谱
- 输出：文献综述材料 + 真实引用清单

### 3. 前沿分析（research-analyst）
- 分析前沿、趋势、研究空白
- 调用 `scientific-critical-thinking` 客观评估
- 输出：领域地图 + 空白清单

### 4. 创新点（innovation-agent）
- 调用 `scientific-brainstorming` 生成候选创新
- 提出可验证假设
- 调用 `peer-review` 以审稿人视角自审
- 输出：创新设计文档

### 5. 方法设计（experiment-agent）
- 设计技术路线（模型 / 算法 / 流程）
- 调用 `context7` 核对框架用法

### 6. 实验设计（experiment-agent）
- 设计实验矩阵、数据集、指标、统计检验
- 调用 `scientific-critical-thinking` 查偏倚
- 输出：实验方案（含复现说明）

### 7. 论文写作（paper-writer）
- 调用 `scientific-writing` 撰写各章节
- 引用从 memory 真实文献清单取用
- 调用 `scientific-schematics` / `scientific-visualization` 制图
- 调用 `peer-review` 投稿前自审
- 输出：论文初稿（引用真实、数据一致）

## 并行协作点
- **阶段 2**：不同数据库/子主题的文献检索可并行
- **阶段 4**：多个候选创新方向可并行生成后评估
- **阶段 7**：各章节（Related Work / Method / Experiment）可并行起草后合并

## 参与 Agent
| 阶段 | Agent | 主要 MCP |
|------|-------|----------|
| 文献调研 | literature-agent | fetch, memory, playwright |
| 前沿分析 | research-analyst | memory, sequential-thinking |
| 创新点 | innovation-agent | sequential-thinking, memory |
| 方法/实验 | experiment-agent | sequential-thinking, context7 |
| 论文写作 | paper-writer | memory, fetch |

## 质量门禁
- 禁止编造引用：所有文献必须真实可验证
- 实验结果数字必须与实验数据一致
- 假设必须可证伪
- 方法描述必须与实验实现一致