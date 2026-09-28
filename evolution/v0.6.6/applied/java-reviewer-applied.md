# java-reviewer v1 → v2 Applied (v0.6.6)

apply_id: APP-066-02
proposal: P-066-02
benchmark: BM-066-01
decision: accept
applied_at: "2026-09-21"
team: java

## changed_files

- source/prompts/java/java-reviewer.md      : v1 → v2（evidence-first + severity-gated + 反遗漏）
- agents/java/java-reviewer.md              : 同步 v2（镜像 prompt）

## changes_summary

- added: 证据优先（evidence-first）：每条 Issue 带 Evidence 类型 + 置信度
- added: 默认检查、反遗漏 bias：维度 1-9 逐项走完，不因"看起来没问题"跳过
- added: 放行优先级（severity-gated）：Blocker/Major 必须修，Minor/Nit 可放行
- added: 误报自检：无法定位的观察标"建议核实"（低置信度）
- added: version 头（v0.6.6, proposal P-066-02）
- kept: 全部审查维度（1-9）与系统层协议（Artifact 审批 / Quality Gate / Context / Memory）
- removed: 无

## baseline_check

- Agent = 30（未新增 / 未删除）
- MCP = 5
- Skill = 26
- Workflow = 8
- Runtime：未修改
- Prompt 数量：仍为 30

## rollback

- 如需回退：恢复 source/prompts/java/java-reviewer.md 为 v1（git 可追溯，见 v0.6.6/history/rollback-sim.yaml）
