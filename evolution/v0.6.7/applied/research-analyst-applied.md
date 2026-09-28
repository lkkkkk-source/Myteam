# research-analyst v1 → v2 Applied (v0.6.7)

apply_id: APP-067-01
proposal: P-067-01
benchmark: BM-067-01
decision: accept
applied_at: "2026-09-21"
team: research
patterns_reused: [PATTERN-001, PATTERN-002, PATTERN-003]
reused_from_team: java

## changed_files

- source/prompts/research/research-analyst.md : v1 → v2（证据化输出 + 优先级分级 + 反幻想/反遗漏）
- agents/research/research-analyst.md          : 同步 v2（镜像 prompt）

## changes_summary

- added: Output Format 证据化（趋势/空白/建议附文献/数据来源引用，无来源标推测）
- added: 方向建议按证据强度分级（Strong hypothesis / Candidate / Speculative）
- added: 反幻想 guardrail（无证据的"值得做"默认低置信）
- added: 反遗漏 bias（多源观点覆盖反对/反例视角）
- reused: PATTERN-001 evidence-based-output（origin=java-developer v2, v0.6.5）
- kept: 全部系统层协议（Role / Responsibility / Workflow / MCP / Skill）
- removed: 无

## baseline_check

- Agent = 30（未增 / 未删）
- MCP = 5
- Skill = 26
- Workflow = 8
- Runtime：未修改
- Prompt 总数仍为 30

## rollback

- 覆盖回退：恢复 source/prompts/research/research-analyst.md 为 v1（git 可追踪），
  登记见 v0.6.7/history/rollback-sim.yaml。
