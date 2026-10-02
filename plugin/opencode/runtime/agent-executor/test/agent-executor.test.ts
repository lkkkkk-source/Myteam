/**
 * MyTeam OpenCode Plugin — AgentExecutor V2 Test (agent-executor.test.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * 验证完整执行管线（设计 §5 + §6 + §7 + §8），12 场景：
 *   1. 完整成功管线（answer：Null adapter 回显 goal → ok=true / output=goal）
 *   2. 显式模型接入（responder 返回结构化 answer → ok=true / output 透传）
 *   3. TaskInput 校验失败（instance_id 不匹配 → ok=false / agent_error）
 *   4. goal 为空（ok=false / agent_error）
 *   5. 取消信号（aborted → ok=false / cancel）
 *   6. 模型失败（ok=false → 折叠 model_error）
 *   7. 解析失败（非法 JSON → invalid_response）
 *   8. checkpoint 无损（message / options 由 checkpointMessage / checkpointOptions 带出）
 *   9. 工具未声明（validator 拒绝 → Fail-Closed，port 不调用）
 *   10. 工具权限拒绝（allowed=false → tool_denied，Fail-Closed）
 *   11. 工具批处理成功（port.invoke 逐项调用 → ok=true / output 汇总）
 *   12. 工具批处理失败（其一失败 → ok=false / tool_error，Fail-Closed）
 *
 * 跑法：bun plugin/opencode/runtime/agent-executor/test/agent-executor.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import type { AgentRuntimeInstance } from "../../../agent-instance";
import type { AgentExecutionContext } from "../../tool-bridge/context";
import type { AgentPermission } from "../../tool-bridge/permission-resolver";
import type {
  TaskInput,
  ToolInvocationPort,
  ToolInvocationResult,
} from "../../runner/types";
import type { ModelRequest } from "../../model/types";
import {
  AgentExecutorImpl,
  createAgentExecutor,
} from "../agent-executor";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`);
  }
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

function makeInstance(executionId = "EX-001"): AgentRuntimeInstance {
  return {
    id: `${executionId}:coder`,
    agent: "coder",
    role: "code agent",
    prompt_source: "D:/data/code/Agent/MyTeam/agents/coder.md",
    workspace: "D:/data/code/Agent/MyTeam",
    memory_namespace: "D:/data/code/Agent/MyTeam/.team/memory/agents/coder",
    execution_id: executionId,
    permissions: ["read", "edit", "execute"],
    status: "bound",
    instance_dir: `D:/data/code/Agent/MyTeam/.team/runtime/agent-instance/${executionId}/coder`,
  };
}

function makePermissions(): AgentPermission {
  return { read: true, edit: true, execute: true };
}

function makeContext(instance: AgentRuntimeInstance): AgentExecutionContext {
  return {
    schema_version: 1,
    layer: "tool-bridge-context",
    agent_instance: instance,
    workspace: instance.workspace,
    tools: [
      { tool: "read", source: "host", allowed: true, reason: "ok" },
      { tool: "edit", source: "host", allowed: true, reason: "ok" },
      { tool: "bash", source: "host", allowed: true, reason: "ok" },
      { tool: "grep", source: "host", allowed: true, reason: "ok" },
      { tool: "glob", source: "host", allowed: true, reason: "ok" },
    ],
    permissions: makePermissions(),
    mcp: [],
    skills: [],
    security: {
      allowed_paths: [instance.workspace],
      deny_paths: ["D:/data/code/Agent/MyTeam/.team"],
      host_config: "C:/Users/admin/.config/opencode",
      myteam_home: "D:/data/code/Agent/MyTeam",
    },
    persistence_target: `D:/data/code/Agent/MyTeam/.team/runtime/context/${instance.agent}`,
  };
}

function makePort(calls: string[] = [], failTool?: string): ToolInvocationPort {
  return {
    invoke: async (req: { tool: string }): Promise<ToolInvocationResult> => {
      calls.push(req.tool);
      if (failTool && req.tool === failTool) {
        return {
          ok: false,
          error: `tool failed: ${req.tool}`,
          error_kind: "tool_error",
          error_code: "E_TOOL",
          duration: 1,
        };
      }
      return {
        ok: true,
        value: `out:${req.tool}`,
        duration: 1,
      };
    },
  };
}

function makeTaskInput(
  instance: AgentRuntimeInstance,
  goal = "implement feature X"
): TaskInput {
  return {
    goal,
    prompt_source: instance.prompt_source,
    workspace: instance.workspace,
    memory_ns: instance.memory_namespace,
    permissions: instance.permissions,
    execution_id: instance.execution_id,
    instance_id: instance.id,
    agent: instance.agent,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: 完整成功管线（answer；Null adapter 回显 goal）
// ---------------------------------------------------------------------------

async function testSuccess() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const calls: string[] = [];
  const port = makePort(calls);
  const executor = createAgentExecutor(context, instance, port);
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("execute ok=true", result.ok === true);
  check("output = goal", result.output === "implement feature X");
  check("artifacts = []", result.artifacts?.length === 0);
  check("no checkpoint requested", result.checkpointRequested !== true);
  check("port.invoke not called (answer path)", calls.length === 0);
}

// ---------------------------------------------------------------------------
// Scenario 2: 显式模型接入（responder 返回结构化 answer）
// ---------------------------------------------------------------------------

async function testModelAnswer() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const port = makePort();
  const responder = (req: ModelRequest) =>
    JSON.stringify({ kind: "answer", text: "analysis done", artifacts: [] });
  const executor = createAgentExecutor(context, instance, port, undefined, {
    modelAdapter: { complete: async (req: ModelRequest) => ({ ok: true, text: responder(req), finish_reason: "stop", usage: {} }) },
  });
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("model answer ok=true", result.ok === true);
  check("output from model", result.output === "analysis done");
}

// ---------------------------------------------------------------------------
// Scenario 3: TaskInput 校验失败（instance_id 不匹配）
// ---------------------------------------------------------------------------

async function testValidationMismatch() {
  const instanceA = makeInstance("EX-001");
  const instanceB = makeInstance("EX-002");
  const context = makeContext(instanceA);
  const port = makePort();
  const executor = createAgentExecutor(context, instanceA, port);
  const taskInput = makeTaskInput(instanceB);

  const result = await executor.execute(taskInput);

  check("validation mismatch ok=false", result.ok === false);
  check(
    "error contains instance mismatch",
    result.error?.includes("instance mismatch") === true
  );
}

// ---------------------------------------------------------------------------
// Scenario 4: goal 为空
// ---------------------------------------------------------------------------

async function testEmptyGoal() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const port = makePort();
  const executor = createAgentExecutor(context, instance, port);
  const taskInput = makeTaskInput(instance, "  ");

  const result = await executor.execute(taskInput);

  check("empty goal ok=false", result.ok === false);
  check("error non-empty", (result.error?.length ?? 0) > 0);
}

// ---------------------------------------------------------------------------
// Scenario 5: 取消信号
// ---------------------------------------------------------------------------

async function testCancelSignal() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const port = makePort();
  const ac = new AbortController();
  ac.abort();
  const executor = createAgentExecutor(context, instance, port, ac.signal);
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("cancel ok=false", result.ok === false);
  check("error kind = cancel", result.error?.includes("[cancel]") === true);
}

// ---------------------------------------------------------------------------
// Scenario 6: 模型失败（ok=false → 折叠 model_error）
// ---------------------------------------------------------------------------

async function testModelFailure() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const port = makePort();
  const executor = createAgentExecutor(context, instance, port, undefined, {
    modelAdapter: {
      complete: async () => ({
        ok: false,
        text: "",
        finish_reason: "error",
        error_kind: "model_error",
        error_detail: "upstream refused",
      }),
    },
  });
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("model failure ok=false", result.ok === false);
  check("error kind = model_error", result.error?.includes("[model_error]") === true);
}

// ---------------------------------------------------------------------------
// Scenario 7: 解析失败（非法 JSON）
// ---------------------------------------------------------------------------

async function testParseFailure() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const port = makePort();
  const executor = createAgentExecutor(context, instance, port, undefined, {
    modelAdapter: {
      complete: async () => ({
        ok: true,
        text: "{ not json",
        finish_reason: "stop",
        usage: {},
      }),
    },
  });
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("parse failure ok=false", result.ok === false);
  check("error kind = invalid_response", result.error?.includes("[invalid_response]") === true);
}

// ---------------------------------------------------------------------------
// Scenario 8: checkpoint 无损
// ---------------------------------------------------------------------------

async function testCheckpointLossless() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const port = makePort();
  const executor = createAgentExecutor(context, instance, port, undefined, {
    modelAdapter: {
      complete: async () => ({
        ok: true,
        text: JSON.stringify({
          kind: "checkpoint",
          message: "confirm plan?",
          options: ["approve", "reject"],
        }),
        finish_reason: "stop",
        usage: {},
      }),
    },
  });
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("checkpoint ok=true", result.ok === true);
  check("checkpointRequested=true", result.checkpointRequested === true);
  check("checkpointMessage lossless", result.checkpointMessage === "confirm plan?");
  check(
    "checkpointOptions lossless",
    JSON.stringify(result.checkpointOptions) === JSON.stringify(["approve", "reject"])
  );
}

// ---------------------------------------------------------------------------
// Scenario 9: 工具未声明 → Fail-Closed
// ---------------------------------------------------------------------------

async function testUndeclaredTool() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const calls: string[] = [];
  const port = makePort(calls);
  const executor = createAgentExecutor(context, instance, port, undefined, {
    modelAdapter: {
      complete: async () => ({
        ok: true,
        text: JSON.stringify({
          kind: "tool_calls",
          calls: [
            { tool: "undeclared", source: "host", arguments: {} },
          ],
        }),
        finish_reason: "stop",
        usage: {},
      }),
    },
  });
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("undeclared tool ok=false", result.ok === false);
  check(
    "error kind = invalid_response",
    result.error?.includes("[invalid_response]") === true
  );
  check("port.invoke NOT called (Fail-Closed)", calls.length === 0);
}

// ---------------------------------------------------------------------------
// Scenario 10: 工具权限拒绝 → Fail-Closed
// ---------------------------------------------------------------------------

async function testToolDenied() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const calls: string[] = [];
  const port = makePort(calls);
  // 覆盖 context 中 read 的 allowed=false
  context.tools = context.tools.map((t) =>
    t.tool === "read" ? { ...t, allowed: false } : t
  );
  const executor = createAgentExecutor(context, instance, port, undefined, {
    modelAdapter: {
      complete: async () => ({
        ok: true,
        text: JSON.stringify({
          kind: "tool_calls",
          calls: [
            { tool: "read", source: "host", arguments: { path: instance.workspace } },
          ],
        }),
        finish_reason: "stop",
        usage: {},
      }),
    },
  });
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("denied tool ok=false", result.ok === false);
  check("error kind = tool_denied", result.error?.includes("[tool_denied]") === true);
  check("port.invoke NOT called (Fail-Closed)", calls.length === 0);
}

// ---------------------------------------------------------------------------
// Scenario 11: 工具批处理成功
// ---------------------------------------------------------------------------

async function testToolCallsSuccess() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const calls: string[] = [];
  const port = makePort(calls);
  const executor = createAgentExecutor(context, instance, port, undefined, {
    modelAdapter: {
      complete: async () => ({
        ok: true,
        text: JSON.stringify({
          kind: "tool_calls",
          calls: [
            { tool: "read", source: "host", arguments: { path: instance.workspace } },
            { tool: "grep", source: "host", arguments: { pattern: "TODO" } },
          ],
        }),
        finish_reason: "stop",
        usage: {},
      }),
    },
  });
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("tool batch ok=true", result.ok === true);
  check("port.invoke called twice", calls.length === 2);
  check(
    "output summarizes tools",
    result.output.includes("read") && result.output.includes("grep")
  );
}

// ---------------------------------------------------------------------------
// Scenario 12: 工具批处理失败 → Fail-Closed
// ---------------------------------------------------------------------------

async function testToolCallsFailure() {
  const instance = makeInstance();
  const context = makeContext(instance);
  const calls: string[] = [];
  const port = makePort(calls, "grep");
  const executor = createAgentExecutor(context, instance, port, undefined, {
    modelAdapter: {
      complete: async () => ({
        ok: true,
        text: JSON.stringify({
          kind: "tool_calls",
          calls: [
            { tool: "read", source: "host", arguments: { path: instance.workspace } },
            { tool: "grep", source: "host", arguments: { pattern: "TODO" } },
          ],
        }),
        finish_reason: "stop",
        usage: {},
      }),
    },
  });
  const taskInput = makeTaskInput(instance);

  const result = await executor.execute(taskInput);

  check("tool batch failure ok=false", result.ok === false);
  check("error kind = tool_error", result.error?.includes("[tool_error]") === true);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("== 1. execute success (Null adapter) ==");
  await testSuccess();

  console.log("== 2. model answer ==");
  await testModelAnswer();

  console.log("== 3. validation mismatch ==");
  await testValidationMismatch();

  console.log("== 4. empty goal ==");
  await testEmptyGoal();

  console.log("== 5. cancel signal ==");
  await testCancelSignal();

  console.log("== 6. model failure ==");
  await testModelFailure();

  console.log("== 7. parse failure ==");
  await testParseFailure();

  console.log("== 8. checkpoint lossless ==");
  await testCheckpointLossless();

  console.log("== 9. undeclared tool (Fail-Closed) ==");
  await testUndeclaredTool();

  console.log("== 10. denied tool (Fail-Closed) ==");
  await testToolDenied();

  console.log("== 11. tool batch success ==");
  await testToolCallsSuccess();

  console.log("== 12. tool batch failure (Fail-Closed) ==");
  await testToolCallsFailure();

  console.log("");
  console.log(`===== agent-executor: ${passed}/${passed + failed} PASS =====`);
  if (failed > 0) process.exit(1);
}

main();
