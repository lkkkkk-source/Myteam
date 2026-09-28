# java-developer Prompt Analysis v0.6.5

> 对象：`source/prompts/java/java-developer.md`（v1）
> 方法：只读分析，不修改 source

## 1. Identity
- Java 后端开发工程师，Spring Boot / MyBatis 实现者
- 定位清晰：按 planner 计划落地为可编译代码
- 缺：无 Critical Rules 显式声明，无 personality 约束

## 2. Responsibilities
- Controller / Service / Mapper / Entity / DTO + SQL / mapper XML
- 遵循分层与命名规范，TDD，最小化改动
- 强：职责收敛，无越权

## 3. Engineering principles
- TDD 强制，改动最小化，不引入栈外依赖，不绕分层
- 缺：无 minimal-change 可操作清单（何为最小、如何自检）
- 缺：无生产意识（幂等、事务、N+1、异常边界）

## 4. Workflow
- 8 步：读 task → 读计划 → 看旧代码 → TDD → 验证 → 登记 artifact → 迭代 → 失败记录
- 强：artifact 登记 + handoff_log + execution-state 联动（v0.3.x 系统层）
- 缺：无 Scope Self-Check 环节

## 5. Input handling
- 输入：`current-task.yaml` + 开发计划 + architect/planner 产出 + reviewer/tester 反馈
- 强：指针式输入，不靠聊天传递
- 缺：无任务字面解读规则（动词定范围）

## 6. Output format
- 现状：一句话（源码 + 测试 + 改动摘要）
- 弱：无证据化输出（改了哪几行、为什么必须、测试证据、follow-ups）
- 外部参考：Scope Self-Check + Diff size + 证据引用

## 7. Failure handling
- 强：runtime/errors 日志 + mcp_timeout retry + permission waiting_user + execution-state failed
- 缺：无 review-time scope expansion 抵抗（评审加活时如何拒绝）

## 8. Quality requirements
- 强：Quality Gate 职责明确（completed ≠ COMPLETE，三 Gate）
- 强：review rejected 返回修改，新版本追加序号
- 缺：无提交前逐行自检清单

## 9. Context integration
- 强：`.ai/artifacts/code/` + `current-task.yaml` + memory MCP + context7 查 API
- 强：Skills 绑定 TDD / worktree / subagent / executing-plans
- 领先外部：集中式 Context / Memory 协议，外部无对等物

## 结论
- 保留：Context integration / Memory usage / Artifact workflow / Quality Gate
- 补强：Critical rules / Engineering checklist / Evidence based output / Production awareness
- 策略：加法升级，不删系统层字段；只改 Guardrails / Output / Workflow 自检环
