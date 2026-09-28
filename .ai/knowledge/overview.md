# Project Overview

> Project Manager Agent 启动时读取本文档，快速建立项目上下文。

## 项目性质
- **类型**：OpenCode Agent 配置型项目（非 Maven / Node）
- **用途**：MyTeam — 多 Agent 协作系统（管理 Java / Research / Creative / Advisory / Knowledge / EngOps 六部门）

## 架构分层（v0.1.0 + PM Layer）
```
用户 ──→ project-manager-agent（唯一入口）
             │
        ┌────┴──────────────┐
        │   部门 Lead 层       │
   java-lead  research-lead  creative-lead  engops-lead
        │
        ▼
   执行 Agent（developer / writer / 等 24 个）
```
- **用户只面对 Project Manager**，不直接面对各 Agent
- PM 负责：需求理解 / 澄清 / 拆解 / 技术路线 / 部门选择 / Workflow 选择 / 任务协调 / 结果汇总
- Lead 负责本部门编排，PM 不直接调用执行 Agent

## 技术栈
- 配置：JSON（`opencode.json`）+ Markdown（prompts / workflows / docs）
- 知识库：`.ai/knowledge/`（项目隔离）
- MCP：context7 / fetch / playwright / sequential-thinking / memory

## 关键目录
| 路径 | 内容 |
|------|------|
| `C:\Users\Administrator\.config\opencode\prompts\` | 各 Agent prompt（pm / leads / advisory / java / research / creative / knowledge / engops） |
| `C:\Users\Administrator\.config\opencode\workflows\` | 8 个 workflow（均由对应 Lead 编排） |
| `C:\Users\Administrator\.config\opencode\docs\` | 系统文档 |
| `.ai/knowledge/` | 项目知识（architecture / patterns / decisions / commands / gotchas / overview） |

## 部门与 Lead 对应
| 部门 | Lead | 子 Agent 数 |
|------|------|------------|
| Java Team | java-lead | 6 |
| Research Team | research-lead | 5 |
| Creative Team | creative-lead | 4 |
| EngOps Team | engops-lead | 4 |
| Advisory | （由 PM 直接协调） | 3 |
| Knowledge | （由 PM / project-knowledge-manager 管理） | 2 |

## 知识文件速查
| 文件 | 何时读 |
|------|--------|
| `overview.md`（本文件） | PM 每次任务开始 |
| `architecture.md` | 涉及架构 / 模块 / 布局判断 |
| `decisions/` | 涉及历史决策约束 |
| `patterns.md` | 配置模式约定 |
| `gotchas.md` | 已知坑与高频 bug 模式 |
| `commands/` | 构建 / 验证命令 |

## 决策更新规则
- PM 任务中发现**长期决策变化**（架构分层、部门边界、技术栈变更）→ 通知 `adr-recorder` 记录新 ADR
- 发现新坑 → 通知 `project-knowledge-manager` 更新 gotchas
- 本文件由 PM / knowledge-manager 维护，保持最新
