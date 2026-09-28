# ADR-001: 采用全局 Agent + 项目隔离知识库

- 状态: 已接受
- 日期: 2026-09-20
- 决策人: opencode build + project-knowledge-manager

## 背景
需要一个统一的 Agent 系统，同时保证各项目的知识不混淆。需要决定：Agent 定义放在全局还是项目内？知识库放在哪里？

## 决策
- Agent 定义放全局 `C:\Users\Administrator\.config\opencode\opencode.json`（20 个）
- 知识库放**每个项目根目录**：`<project-root>/.ai/knowledge/`
- `project-knowledge-manager` / `adr-recorder` 是全局 Agent，但只操作当前项目知识库

## 备选方案
1. 全局混合知识库（一个全局 knowledge 目录）
   - 否决：项目 A / B / 科研 / 写作知识会混淆，无法按项目隔离
2. 每个项目内嵌 Agent 定义
   - 否决：Agent 逻辑重复，升级难；全局 Agent + 项目知识库已足够

## 后果
- 正面：知识严格隔离，Agent 复用；项目切换无知识污染
- 负面：需要在每个新项目手动初始化 `.ai/knowledge/`；全局 Agent 变更影响所有项目（需回归测试）
- 迁移成本：已有项目补建 `.ai/knowledge/` 即可

## 关联
- `docs/project-knowledge.md`（使用说明）
- `prompts/knowledge/project-knowledge-manager.md`
- `prompts/knowledge/adr-recorder.md`
