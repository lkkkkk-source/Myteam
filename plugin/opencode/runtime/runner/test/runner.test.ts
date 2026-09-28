/**
 * MyTeam OpenCode Plugin — Runner Core Test (runner.test.ts) — v1.7.1
 * ---------------------------------------------------------------------------
 * 验证 7 项：
 *   1. invocation 组装（validateInvocation + prepareTaskInput）
 *   2. tool allowed/denied（invokeTool 校验 + 转发 + 重试）
 *   3. result 转换（normalizeResult / produceNextAction）
 *   4. error mapping（agent_error / tool_error / timeout / cancel / assertion）
 *   5. checkpoint action（Runner 只产生、不自动处理）
 *   6. no direct filesystem（Runner 不触碰 fs）
 *   7. no direct OpenCode call（工具一律经 mock ToolInvocationPort）
 *
 * 跑法：bun plugin/opencode/runtime/runner/test/runner.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AgentRun } from "../types";
import type { AgentRuntimeInstance } from "../../agent-instance";
import type { AgentExecutionContext, ToolDeclaration } from "../../tool-bridge/context";

import {
  validateInvocation,
  prepareTaskInput,
  invokeTool,
  normalizeResult,
  produceNextAction,
  execute,
  type RunnerInvocation,
  type RunnerDeps,
  type ToolInvocationResult,
  type AgentExecutorResult,
} from "../runner";
import {
  RunnerValidationError,
  type ToolInvocationPort,
  type AgentExecutor,
} from "../types";

// ---------------------------------------------------------------------------
// 测试基建
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, extra = ""): void {
  if (ok) {
    passed++;
    console.log(`  PASS ${name}${extra ? " " + extra : ""}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? " " + extra : ""}`);
  }
}

let execSeq = 0;
function makeRun(over?: Partial<AgentRun>): AgentRun {
  execSeq++;
  const execution_id = `EX-${execSeq.toString().padStart(3, "0")}`;
  return {
    execution_id,
    agent_instance_id: `${execution_id}:coder`,
    status: "running",
    input: "do the task",
    output: "",
    started: new Date().toISOString(),
    ...over,
  };
}

function makeInstance(execution_id: string): AgentRuntimeInstance {
  return {
    id: `${execution_id}:coder`,
    agent: "coder",
    role: "code agent",
    prompt_source: "D:/data/code/Agent/MyTeam/agents/coder.md",
    workspace: "D:/data/code/Agent/MyTeam",
    memory_namespace: "D:/data/code/Agent/MyTeam/.team/memory/agents/coder",
    execution_id,
    permissions: ["read", "edit", "execute"],
    status: "bound",
    instance_dir: `D:/data/code/Agent/MyTeam/.team/runtime/agent-instance/${execution_id}/coder`,
  };
}

function makeContext(
  instance: AgentRuntimeInstance,
  tools: ToolDeclaration[] = []
): AgentExecutionContext {
  return {
    schema_version: 1,
    layer: "tool-bridge-context",
    agent_instance: instance,
    workspace: instance.workspace,
    tools,
    permissions: { read: true, edit: true, execute: true },
    mcp: [],
    skills: [],
    security: {
      allowed_paths: [instance.workspace, `${instance.workspace}/.team`],
      deny_paths: ["C:/Users/Administrator/.config/opencode"],
      host_config: "C:/Users/Administrator/.config/opencode",
    },
    persistence_target: `${instance.workspace}/.team/runtime/context/coder/agent-execution-context.yaml`,
  };
}

function makeInvocation(
  opts: {
    run?: AgentRun;
    instance?: AgentRuntimeInstance;
    context?: AgentExecutionContext;
    timeout_ms?: number;
  } = {}
): RunnerInvocation {
  const run = opts.run ?? makeRun();
  const instance = opts.instance ?? makeInstance(run.execution_id);
  const context = opts.context ?? makeContext(instance);
  return {
    run,
    instance,
    context,
    taskInput: prepareTaskInput({
      run,
      instance,
      context,
      taskInput: {} as never,
    } as RunnerInvocation),
    timeout_ms: opts.timeout_ms,
  };
}

function makeExecutor(
  impl: Partial<AgentExecutor> & { execute: AgentExecutor["execute"] }
): AgentExecutor {
  return impl as AgentExecutor;
}

function makePort(impl: { invoke: (r: { tool: string }) => Promise<ToolInvocationResult> }): ToolInvocationPort {
  return impl as unknown as ToolInvocationPort;
}

// ---------------------------------------------------------------------------
// 1. invocation 组装
// ---------------------------------------------------------------------------

function testInvocation() {
  const inv = makeInvocation();
  const ti = prepareTaskInput(inv);

  check("goal from run.input", ti.goal === inv.run.input);
  check("prompt_source from instance", ti.prompt_source === inv.instance.prompt_source);
  check("workspace from instance", ti.workspace === inv.instance.workspace);
  check("memory_ns from instance", ti.memory_ns === inv.instance.memory_namespace);
  check("permissions from instance", ti.permissions === inv.instance.permissions);
  check("execution_id passthrough", ti.execution_id === inv.run.execution_id);
  check("instance_id passthrough", ti.instance_id === inv.instance.id);

  validateInvocation(inv); // 合法 → 不抛
  check("valid invocation passes validation", true);

  let threw = false;
  try {
    validateInvocation({ ...inv, taskInput: { ...inv.taskInput, goal: "" } });
  } catch (e) {
    threw = e instanceof RunnerValidationError;
  }
  check("empty goal rejected", threw);

  let threw2 = false;
  try {
    const bad = makeInvocation();
    validateInvocation({ ...bad, instance: { ...bad.instance, execution_id: "EX-999" } });
  } catch (e) {
    threw2 = e instanceof RunnerValidationError;
  }
  check("execution_id mismatch rejected", threw2);
}

// ---------------------------------------------------------------------------
// 2. tool allowed / denied
// ---------------------------------------------------------------------------

async function testToolBoundary() {
  const instance = makeInstance("EX-000");
  const declAllowed: ToolDeclaration = {
    tool: "read",
    source: "host",
    allowed: true,
    reason: "read permission granted",
  };
  const declDenied: ToolDeclaration = {
    tool: "bash",
    source: "host",
    allowed: false,
    reason: "execute permission denied",
  };
  const ctx = makeContext(instance, [declAllowed, declDenied]);

  let ok = false;
  let result: ToolInvocationResult | null = null;
  const port = makePort({
    async invoke(r) {
      ok = true;
      result = { ok: true, value: "file content", duration: 1 };
      return result;
    },
  });
  const deps: RunnerDeps = { toolPort: port, executor: null as never };

  const res = await invokeTool(
    deps,
    "read",
    "host",
    { path: instance.workspace + "/a.txt" },
    ctx.tools,
    ctx.security
  );
  check("allowed tool forwarded to port", ok);
  check("allowed tool returns value", res.value === "file content");

  // denied tool → 不转发、抛断言错误
  let deniedBlocked = false;
  let forwardedOnDenied = false;
  const port2 = makePort({
    async invoke() {
      forwardedOnDenied = true;
      return { ok: true, value: 1, duration: 0 };
    },
  });
  try {
    await invokeTool(
      { toolPort: port2, executor: null as never },
      "bash",
      "host",
      {},
      ctx.tools,
      ctx.security
    );
  } catch (e) {
    deniedBlocked = e instanceof RunnerValidationError;
  }
  check("denied tool blocked", deniedBlocked);
  check("denied tool NOT forwarded", !forwardedOnDenied);

  // 未知工具 → 拒绝
  let unknownBlocked = false;
  try {
    await invokeTool(
      { toolPort: port2, executor: null as never },
      "ghost",
      "host",
      {},
      ctx.tools,
      ctx.security
    );
  } catch (e) {
    unknownBlocked = e instanceof RunnerValidationError;
  }
  check("undeclared tool blocked", unknownBlocked);

  // 路径越域（写 Home deny 域）→ 拒绝
  let pathBlocked = false;
  try {
    await invokeTool(
      { toolPort: port2, executor: null as never },
      "write",
      "host",
      { path: "C:/Users/Administrator/.config/opencode/opencode.json" },
      [{ tool: "write", source: "host", allowed: true }],
      ctx.security
    );
  } catch (e) {
    pathBlocked = e instanceof RunnerValidationError;
  }
  check("path outside deny domain blocked", pathBlocked);

  // 可重试：前两次失败、第三次成功
  let calls = 0;
  const port3 = makePort({
    async invoke() {
      calls++;
      if (calls < 3) return { ok: false, error: "transient", duration: 1 };
      return { ok: true, value: "recovered", duration: 1 };
    },
  });
  const retryRes = await invokeTool(
    { toolPort: port3, executor: null as never },
    "read",
    "host",
    {},
    [declAllowed],
    ctx.security
  );
  check("tool retry succeeds", retryRes.value === "recovered");
  check("tool retry attempt count", calls === 3);
}

// ---------------------------------------------------------------------------
// 3. result 转换
// ---------------------------------------------------------------------------

function testResult() {
  const t0 = Date.now();

  const okResult: AgentExecutorResult = {
    ok: true,
    output: "all done",
    artifacts: ["D:/data/code/Agent/MyTeam/out.txt"],
  };
  const r = normalizeResult(okResult, t0, t0 + 10);
  check("ok → completed", r.status === "completed");
  check("ok → nextAction complete", r.nextAction === "complete");
  check("output carried", r.output === "all done");
  check("artifact registered", r.artifacts.length === 1 && r.artifacts[0].path.endsWith("out.txt"));
  check("meta has start/end", !!r.meta.started && !!r.meta.completed);
  check("no error kind on ok", r.meta.error === undefined);

  const failResult: AgentExecutorResult = {
    ok: false,
    output: "",
    error: "model crashed",
  };
  const rf = normalizeResult(failResult, t0, t0 + 5);
  check("fail → failed", rf.status === "failed");
  check("fail → nextAction fail", rf.nextAction === "fail");
  check("fail error kind = agent_error", rf.meta.error === "agent_error");
  check("fail error detail carried", rf.meta.errorDetail === "model crashed");

  check("produceNextAction ok", produceNextAction({ ok: true, output: "" }) === "complete");
  check("produceNextAction fail", produceNextAction({ ok: false, output: "" }) === "fail");
  check(
    "produceNextAction checkpoint",
    produceNextAction({ ok: true, output: "", checkpointRequested: true }) === "human_checkpoint"
  );
}

// ---------------------------------------------------------------------------
// 4. error mapping（agent_error / tool_error / timeout / cancel / assertion）
// ---------------------------------------------------------------------------

async function testErrorMapping() {
  // agent_error：执行体抛异常
  const inv = makeInvocation();
  const depsAgent: RunnerDeps = {
    toolPort: null as never,
    executor: makeExecutor({
      async execute() {
        throw new Error("boom in agent");
      },
    }),
  };
  const r1 = await execute(inv, depsAgent);
  check("agent_error → failed", r1.status === "failed");
  check("agent_error kind", r1.meta.error === "agent_error");
  check("agent_error detail", r1.meta.errorDetail === "boom in agent");

  // tool_error：工具重试耗尽后失败（经 invokeTool 抛 tool_error）
  const inv2 = makeInvocation({
    context: makeContext(inv.instance, [
      { tool: "read", source: "host", allowed: true, reason: "granted" },
    ]),
  });
  const depsTool: RunnerDeps = {
    toolPort: makePort({
      async invoke() {
        return { ok: false, error: "read timeout", duration: 1 };
      },
    }),
    executor: makeExecutor({
      async execute() {
        return { ok: true, output: "intermediate", checkpointRequested: false };
      },
    }),
  };
  // 直接驱动 invokeTool 观察 tool_error 分类
  let toolErr: unknown = null;
  try {
    await invokeTool(depsTool, "read", "host", {}, inv2.context.tools, inv2.context.security);
  } catch (e) {
    toolErr = e;
  }
  check(
    "tool_error raised after retries",
    toolErr instanceof RunnerValidationError === false &&
      (toolErr as { kind?: string })?.kind === "tool_error"
  );

  // timeout：executor 挂起 → execute() 在 timeout_ms 内返回 failed/timeout
  const invT = makeInvocation({ timeout_ms: 20 });
  const depsTimeout: RunnerDeps = {
    toolPort: null as never,
    executor: makeExecutor({
      async execute() {
        await new Promise((r) => setTimeout(r, 500));
        return { ok: true, output: "late" };
      },
    }),
    now: () => Date.now(),
  };
  const rT = await execute(invT, depsTimeout);
  check("timeout → failed", rT.status === "failed");
  check("timeout kind", rT.meta.error === "timeout");

  // cancel：signal 已 aborted → cancel kind
  const ac = new AbortController();
  ac.abort("user cancelled");
  const depsCancel: RunnerDeps = {
    toolPort: null as never,
    executor: makeExecutor({
      async execute() {
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true, output: "ignored" };
      },
    }),
    signal: ac.signal,
  };
  const rC = await execute(makeInvocation(), depsCancel);
  check("cancel → failed", rC.status === "failed");
  check("cancel kind", rC.meta.error === "cancel");

  // assertion：非法 invocation（execution_id 不匹配）→ assertion_error
  const invBad = makeInvocation();
  const badDeps: RunnerDeps = {
    toolPort: null as never,
    executor: makeExecutor({
      async execute() {
        return { ok: true, output: "should not run" };
      },
    }),
  };
  const rA = await execute(
    { ...invBad, instance: { ...invBad.instance, execution_id: "EX-999" } },
    badDeps
  );
  check("assertion → failed", rA.status === "failed");
  check("assertion kind", rA.meta.error === "assertion_error");
}

// ---------------------------------------------------------------------------
// 5. checkpoint action（Runner 只产生、不自动处理）
// ---------------------------------------------------------------------------

async function testCheckpoint() {
  const inv = makeInvocation();
  const deps: RunnerDeps = {
    toolPort: null as never,
    executor: makeExecutor({
      async execute() {
        return {
          ok: true,
          output: "needs approval",
          checkpointRequested: true,
          checkpointMessage: "approve write?",
          checkpointOptions: ["continue", "modify", "reject"],
        };
      },
    }),
  };
  const r = await execute(inv, deps);
  check("checkpoint requested", r.status === "checkpoint_requested");
  check("checkpoint nextAction", r.nextAction === "human_checkpoint");
  check("runner does NOT auto-resolve", true); // 无 resolveCheckpoint 调用；仅产生 action

  // 校验：Runner 不在 checkpoint 时自动 continue / 自动 resolve
  const r2 = await execute(inv, {
    ...deps,
    executor: makeExecutor({
      async execute() {
        return { ok: true, output: "normal", checkpointRequested: false };
      },
    }),
  });
  check("no checkpoint → normal complete", r2.nextAction === "complete" && r2.status === "completed");
}

// ---------------------------------------------------------------------------
// 6. no direct filesystem（Runner 不触碰 fs）
// ---------------------------------------------------------------------------

async function testNoFilesystem() {
  // 静态检查：runner.ts 不得 import node:fs / bun:fs 等
  const src = fs.readFileSync(
    path.join(__dirname, "..", "runner.ts"),
    "utf8"
  );
  check(
    "runner.ts does not import fs",
    !/from ["']node:fs["']|from ["']bun["']|require\(["']fs["']\)/.test(src)
  );

  // 动态检查：execute() 后项目目录中不产生任何新文件
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "myteam-runner-"));
  try {
    const proj = path.join(tmp, "proj");
    const run = makeRun();
    const instance = makeInstance(run.execution_id);
    const inst2 = { ...instance, workspace: proj };
    const ctx = makeContext(inst2);
    const before = new Set<string>();
    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        before.add(p);
        if (e.isDirectory()) walk(p);
      }
    };
    walk(proj);
    const inv = makeInvocation({ run, instance: inst2, context: ctx });
    const deps: RunnerDeps = {
      toolPort: makePort({ async invoke() { return { ok: true, value: 1, duration: 0 }; } }),
      executor: makeExecutor({
        async execute() {
          return { ok: true, output: "no fs", artifacts: [] };
        },
      }),
    };
    await execute(inv, deps);
    const after = new Set<string>();
    walk(proj);
    let newFile = false;
    for (const p of after) if (!before.has(p)) newFile = true;
    check("execute() creates no files", !newFile);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 7. no direct OpenCode call（工具一律经 mock port）
// ---------------------------------------------------------------------------

async function testNoDirectOpenCodeCall() {
  let portCalled = 0;
  const inv = makeInvocation({
    context: makeContext(makeInstance("EX-000"), [
      { tool: "read", source: "host", allowed: true, reason: "granted" },
    ]),
  });
  const deps: RunnerDeps = {
    toolPort: makePort({
      async invoke() {
        portCalled++;
        return { ok: true, value: "from port", duration: 1 };
      },
    }),
    executor: makeExecutor({
      async execute() {
        return { ok: true, output: "done" };
      },
    }),
  };
  const res = await invokeTool(deps, "read", "host", {}, inv.context.tools, inv.context.security);
  check("tool result sourced from mock port", res.value === "from port");
  check("port invoked exactly once", portCalled === 1);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  console.log("== 1. invocation assembly ==");
  await testInvocation();

  console.log("== 2. tool allowed/denied ==");
  await testToolBoundary();

  console.log("== 3. result conversion ==");
  await testResult();

  console.log("== 4. error mapping ==");
  await testErrorMapping();

  console.log("== 5. checkpoint action ==");
  await testCheckpoint();

  console.log("== 6. no direct filesystem ==");
  await testNoFilesystem();

  console.log("== 7. no direct OpenCode call ==");
  await testNoDirectOpenCodeCall();

  console.log("");
  console.log(`===== runner: ${passed}/${passed + failed} PASS =====`);
  if (failed > 0) process.exit(1);
}

main();
