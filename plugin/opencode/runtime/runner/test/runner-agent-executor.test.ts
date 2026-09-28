/**
 * MyTeam OpenCode Plugin — Runner × AgentExecutor Integration Test — v1.8.0
 * ---------------------------------------------------------------------------
 * Phase 8 — 验证 createRunnerDeps 把 AgentExecutorImpl 作为默认执行器接入 Runner。
 *
 * 验证 5 项：
 *   1. createRunnerDeps 组装（默认 executor = AgentExecutorImpl）
 *   2. 端到端 execute()：默认执行器 → status=completed / output=goal
 *   3. 显式 executor 覆盖（向后兼容 mock 注入）
 *   4. 工具边界：默认执行器不调用 toolPort（本阶段执行体为占位）
 *   5. 禁则：runner.ts / agent-executor.ts 均不直接 import fs；不直接调用 OpenCode
 *
 * 跑法：bun plugin/opencode/runtime/runner/test/runner-agent-executor.test.ts
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentRun } from "../types";
import type { AgentRuntimeInstance } from "../../agent-instance";
import type {
  AgentExecutionContext,
  ToolDeclaration,
} from "../../tool-bridge/context";

import {
  execute,
  createRunnerDeps,
  prepareTaskInput,
  type RunnerInvocation,
} from "../runner";
import {
  AgentExecutorImpl,
  createAgentExecutor,
} from "../../agent-executor";
import type {
  ToolInvocationPort,
  ToolInvocationResult,
  AgentExecutor,
  RunnerDeps,
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
      myteam_home: "D:/data/code/Agent/MyTeam",
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

/** 记录调用次数的 mock 工具端口。 */
function makePort(): { port: ToolInvocationPort; calls: number[] } {
  const calls: number[] = [];
  const port = {
    async invoke(): Promise<ToolInvocationResult> {
      calls.push(1);
      return { ok: true, value: "should-not-be-called", duration: 1 };
    },
  } as unknown as ToolInvocationPort;
  return { port, calls };
}

// ---------------------------------------------------------------------------
// 1. createRunnerDeps 组装
// ---------------------------------------------------------------------------

function testCreateRunnerDeps() {
  const run = makeRun();
  const instance = makeInstance(run.execution_id);
  const context = makeContext(instance);
  const { port } = makePort();

  const deps: RunnerDeps = createRunnerDeps({
    toolPort: port,
    context,
    instance,
  });

  check("deps.toolPort wired", deps.toolPort === port);
  check("deps.executor is AgentExecutorImpl", deps.executor instanceof AgentExecutorImpl);
  check("deps.signal defaults undefined", deps.signal === undefined);
  check("deps.now defaults undefined", deps.now === undefined);

  // signal 透传
  const ac = new AbortController();
  const deps2 = createRunnerDeps({ toolPort: port, context, instance, signal: ac.signal });
  check("deps.signal passthrough", deps2.signal === ac.signal);

  // now 透传
  let t = 100;
  const deps3 = createRunnerDeps({
    toolPort: port,
    context,
    instance,
    now: () => ++t,
  });
  check("deps.now passthrough", deps3.now !== undefined && deps3.now() === 101);

  // 与工厂 createAgentExecutor 形状一致
  const manual = createAgentExecutor(context, instance, port);
  check("default executor shape matches factory", manual instanceof AgentExecutorImpl);
}

// ---------------------------------------------------------------------------
// 2. 端到端 execute()（默认执行器）
// ---------------------------------------------------------------------------

async function testEndToEnd() {
  const { port, calls } = makePort();
  const inv = makeInvocation();
  const deps = createRunnerDeps({
    toolPort: port,
    context: inv.context,
    instance: inv.instance,
  });

  const res = await execute(inv, deps);

  check("e2e status completed", res.status === "completed");
  check("e2e nextAction complete", res.nextAction === "complete");
  check("e2e output = goal", res.output === inv.taskInput.goal);
  check("e2e artifacts empty", res.artifacts.length === 0);
  check("e2e meta has timestamps", res.meta.started !== "" && res.meta.completed !== "");
  check("e2e no error kind", res.meta.error === undefined);
  check("e2e toolPort not invoked by executor", calls.length === 0);
}

// ---------------------------------------------------------------------------
// 3. 显式 executor 覆盖（向后兼容）
// ---------------------------------------------------------------------------

async function testExplicitOverride() {
  const { port } = makePort();
  const inv = makeInvocation();

  let called = false;
  const mockExecutor: AgentExecutor = {
    async execute() {
      called = true;
      return { ok: true, output: "custom-executor-output", artifacts: [] };
    },
  };

  const deps = createRunnerDeps({
    toolPort: port,
    context: inv.context,
    instance: inv.instance,
    executor: mockExecutor,
  });

  check("override: deps.executor is mock", deps.executor === mockExecutor);

  const res = await execute(inv, deps);
  check("override: mock invoked", called);
  check("override: output from mock", res.output === "custom-executor-output");
  check("override: status completed", res.status === "completed");
}

// ---------------------------------------------------------------------------
// 4. 工具边界（默认执行器不触达 toolPort）
// ---------------------------------------------------------------------------

async function testToolBoundary() {
  const { port, calls } = makePort();
  const inv = makeInvocation();
  const deps = createRunnerDeps({
    toolPort: port,
    context: inv.context,
    instance: inv.instance,
  });

  await execute(inv, deps);
  check("tool boundary: port.invoke not called", calls.length === 0);
}

// ---------------------------------------------------------------------------
// 5. 禁则：不直接 import fs / 不直接调用 OpenCode
// ---------------------------------------------------------------------------

function testNoForbiddenImports() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const runnerDir = path.resolve(here, "..");
  const execDir = path.resolve(here, "..", "..", "agent-executor");

  const runnerSrc = fs.readFileSync(path.join(runnerDir, "runner.ts"), "utf8");
  const execSrc = fs.readFileSync(path.join(execDir, "agent-executor.ts"), "utf8");

  const importFs = /from\s+["']node:fs["']|require\(["']fs["']\)/;
  check("runner.ts does not import fs", !importFs.test(runnerSrc));
  check("agent-executor.ts does not import fs", !importFs.test(execSrc));

  const opencodeCall = /@opencode|from\s+["']opencode["']/i;
  check("runner.ts does not import OpenCode", !opencodeCall.test(runnerSrc));
  check("agent-executor.ts does not import OpenCode", !opencodeCall.test(execSrc));

  // createRunnerDeps 工厂存在于 runner.ts 源码中
  check(
    "createRunnerDeps defined in runner.ts",
    /export\s+function\s+createRunnerDeps/.test(runnerSrc)
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log("== 1. createRunnerDeps assembly ==");
  testCreateRunnerDeps();

  console.log("== 2. end-to-end execute (default executor) ==");
  await testEndToEnd();

  console.log("== 3. explicit executor override ==");
  await testExplicitOverride();

  console.log("== 4. tool boundary ==");
  await testToolBoundary();

  console.log("== 5. forbidden imports ==");
  testNoForbiddenImports();

  console.log("");
  console.log(`===== runner-agent-executor: ${passed}/${passed + failed} PASS =====`);
  if (failed > 0) process.exit(1);
}

main();
