# java-architect v1 → v2 Applied (v0.6.6)

apply_id: APP-066-01
proposal: P-066-01
benchmark: BM-066-01
decision: accept
applied_at: "2026-09-21"
team: java

## changed_files

- source/prompts/java/java-architect.md     : v1 → v2（evidence-based output + scope self-check）
- agents/java/java-architect.md             : 同步 v2（镜像 prompt）

## changes_summary

- added: Output Format 证据化（结论带模块/文件/行 级引用）
- added: Scope Self-Check（read-only 对抗，提交前逐条 justify 写操作）
- added: 决策 vs 探索分离（推荐/备选方案各给 trade-off / 风险 / 理由）
- added: 最小充足设计（不为不存在的大规模场景过度设计）
- added: version 头（v0.6.6, proposal P-066-01）
- kept: 全部系统层协议（Context / Artifact metadata / Memory / Quality Gate）
- removed: 无

## baseline_check

- Agent = 30（未新增 / 未删除）
- MCP = 5
- Skill = 26
- Workflow = 8
- Runtime：未修改
- Prompt 数量：仍为 30

## rollback

- 如需回退：恢复 source/prompts/java/java-architect.md 为 v1（git 可追溯，见 v0.6.6/history/rollback-sim.yaml）
