# java-developer v1 → v2 Applied (v0.6.5)

apply_id: APP-065-01
proposal: P-065-01
benchmark: BM-065-01
decision: accept
applied_at: "2026-09-21"
team: software-engineering

## changed_files

- source/prompts/java/java-developer.md  : v1 → v2（evidence-based output + critical rules）
- agents/java/java-developer.md          : 同步 v2（镜像 prompt）

## changes_summary

- added: Critical Rules 7 条（minimal-change 工程纪律，转写 Spring/MyBatis 语境）
- added: Scope Self-Check（提交前逐行自检）
- added: Evidence based Output（改动行引用 + 测试证据 + diff size + follow-ups）
- added: Production awareness（系统边界校验 / 事务 / 幂等 / N+1 自查）
- added: team/capabilities/quality_rules 元数据头（v0.6.4 兼容）
- added: 评审加活抵抗 → follow-ups（review-time scope expansion 拒绝）
- kept: 全部系统层协议（Context / Memory / Artifact / Quality Gate / Failure handling）
- removed: 无

## baseline_check

- Agent = 30（未新增 / 未删除）
- MCP = 5
- Skill = 26
- Workflow = 8
- Runtime：未修改
- Prompt 数量：仍为 30

## rollback

- 如需回退：恢复 source/prompts/java/java-developer.md 为 v1（git 可追溯）
