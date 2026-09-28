# java-developer External Comparison v0.6.5

> 内部：`source/prompts/java/java-developer.md`（v1）
> 外部：`external/agency-agents/engineering/engineering-senior-developer.md` + `engineering-minimal-change-engineer.md` + `engineering-code-reviewer.md`（Critical Rules / Checklist 部分）
> 原则：只参考，不复制不替换

## 已有优势（MyTeam 领先，v2 必须保留）

- Context integration：`current-task.yaml` 指针 + artifact 登记 + handoff_log + execution-state 联动，外部无集中 Context
- Memory usage：`memory` MCP 读写项目结构/接口约定/团队规范 + task-memory 集中协议，外部为各 agent 内嵌记忆
- Artifact workflow：`.ai/artifacts/code/{task_id}/` 快照/diff + 版本追加不覆盖 + reviewer/tester 反馈迭代环，外部无 artifact 生命周期
- Quality Gate：`completed ≠ COMPLETE` + validation/review/acceptance 三 Gate + rejected 返回修改，外部仅内嵌清单无系统层 Gate

## 外部优势（可吸收，需转写为 MyTeam 协议）

- Critical rules：minimal-change 7 条显式规则（touch only required / 3 行不抽象 / 无不可能防御 / fix 不夹 refactor / 无死代码 shim / 问不猜大 / diff 逐行自证）
- Engineering checklist：提交前 Scope Self-Check（task 原文 / touched files+reason / tempted-but-wont / hypothetical-not-defended / rejected abstractions / diff size）
- Evidence based output：改动行引用 + 测试证据 + follow-ups noted-but-not-done，替代一句话摘要
- Production awareness：边界校验只在系统边界、事务/幂等/N+1 意识、review-time scope expansion 拒绝并转 follow-up issue

## 差异矩阵

| 维度 | v1 现状 | 外部参考 | v2 动作（加法） |
|------|---------|----------|-----------------|
| Identity | 角色+职责 | Critical Rules 显式 | Guardrails 追加 Critical Rules（转写 Spring/MyBatis 语境） |
| Engineering principles | TDD+最小化口号 | 最小改动可操作清单 | 追加 7 条 + Scope Self-Check |
| Output format | 一句话摘要 | 证据化输出 | 改为：改动清单+行引用+测试证据+diff size+follow-ups |
| Failure handling | errors/log/state | 抵抗评审加活 | 追加：评审加活转 follow-up，不直接扩 scope |
| Production | 无 | 边界/幂等/性能 | 追加：只在 Controller/外部 API 校验，Service 信任内 invariant；事务/幂等/N+1 自查 |

## 不采纳

- Laravel/Livewire/FluxUI/Three.js 技术栈内容（与 Spring Boot 无关）
- Premium Design / 60fps / WCAG 等前端标准
- 外部 Memory 分散模式（保持集中式）
- 复制原文：全部转写为 Java/Spring/MyBatis 语境
