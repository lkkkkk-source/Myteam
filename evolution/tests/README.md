# Evolution Tests — v0.6.3

> 校验外部研究库记录、Agent 映射、对比报告、提案与基线。**不修改任何 prompt**。

## Case1 — external source 记录
- `external/agency-agents/` 存在，含 `.git`（克隆成功）。
- `evolution/metadata/external-repo.yaml` 存在，含 upstream URL / license / head。
- 外部 agent md 计数 >= 250（264 实际）。

## Case2 — Agent mapping
- `evolution/analysis/agent-mapping.yaml` 存在。
- 映射类型包含 matched / partial / no-internal。
- 至少 5 个 external division 参与映射（engineering / project-management / research 相关 / creative 相关 / security 相关 / 记忆知识）。

## Case3 — comparison 生成
- `evolution/analysis/prompt-audit.md` 存在，含维度表与发现。
- `evolution/analysis/comparison.md` 存在，含规模对比 / 能力覆盖矩阵 / 差距优先级。
- 输出差异报告即这两个文件（+ proposals）。

## Case4 — proposal 生成（不修改 source prompt）
- `evolution/proposals/upgrade-proposals.yaml` 存在，含 P-xx / C-xx / M-xx / Q-xx 提案。
- 校验：提案状态全部为 proposed；**source/prompts 未被本阶段修改**（基线 md 数量 = 30）。

## Case5 — baseline 检查
- 内部 Agent 数量 = 30（source/prompts）。
- manifest 基线 = 30/5/26/8。
- evolution 只读：`external/` 未进入 source；runtime 未触碰。