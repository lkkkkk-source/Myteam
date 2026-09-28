# content-create（内容创作）

## 使用场景
- 技术文章 / 博客
- PPT / 演示文稿
- 简历优化
- 项目文档

## 输入
- 创作目标（主题、读者、体裁、篇幅）
- 素材 / 已有内容

## 调用 Agent 顺序
> **入口：`creative-lead` 负责按本流程编排**（PM 分派任务到 creative-lead，Lead 协调创作与审核 Agent）。

根据体裁分派创作 Agent（三选一或组合）：
1. **writing-agent**（文章/博客/文档）
   或 **ppt-agent**（演示）
   或 **resume-agent**（简历）
2. **editor-agent** — 逻辑/表达/格式/可读性/事实一致性审核

## 迭代规则
- editor 提出问题 → 原创作 Agent 修订 → 再次送审
- 涉及事实/数据核对 → 调用 fetch 验证
- 涉及图表规范 → 调用 scientific-visualization

## 跳过规则
- 简短内容（< 500 字）：跳过 editor（直接自审）
- 技术术语密集文章：追加 scientific-critical-thinking 核查逻辑严谨性
- 仅润色不重写：仅调用 editor

## 输出要求
- 初稿（按体裁成稿）
- 修改意见（editor 审核报告）
- 最终版本（通过审核）

## 结束条件
- editor 无阻断级问题
- 事实/数据经核对（无编造）
- 符合目标读者与体裁要求

## 不适用
- 长篇论文 → 用 `research-paper`
- 代码文档需与实现强耦合 → 可配合 `feature-development` 的 docs 部分