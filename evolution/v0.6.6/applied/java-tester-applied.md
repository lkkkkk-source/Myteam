# java-tester v1 → v2 Applied (v0.6.6)

apply_id: APP-066-03
proposal: P-066-03
benchmark: BM-066-01
decision: accept
applied_at: "2026-09-21"
team: java

## changed_files

- source/prompts/java/java-tester.md        : v1 → v2（evidence-first + 根因归属证据链 + 反幻想）
- agents/java/java-tester.md                : 同步 v2（镜像 prompt）

## changes_summary

- added: 证据收集（evidence-first）：报告附真实命令输出 / 用例 / 异常栈 / 覆盖率
- added: 根因归属证据链：测试写错 vs 实现 bug 给判断依据，不臆断
- added: 反幻想偏差（default-to-failed）：无证据的"应该能过"不采信
- added: 覆盖率 / 边界分支观察（新增/改动类关键分支是否被覆盖）
- added: version 头（v0.6.6, proposal P-066-03）
- kept: 全部验证职责与系统层协议（validation Gate / Context / Memory / Recovery）
- removed: 无

## baseline_check

- Agent = 30（未新增 / 未删除）
- MCP = 5
- Skill = 26
- Workflow = 8
- Runtime：未修改
- Prompt 数量：仍为 30

## rollback

- 如需回退：恢复 source/prompts/java/java-tester.md 为 v1（git 可追溯，见 v0.6.6/history/rollback-sim.yaml）
