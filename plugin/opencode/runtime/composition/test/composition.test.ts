/**
 * MyTeam OpenCode Plugin — Runtime Composition Test (composition.test.ts) — v1.8.3
 * ---------------------------------------------------------------------------
 * Phase 9 — 验证 createRuntime() 组装层（v1.8.2 Design §2）。
 *
 * 验证 10 项：
 *   1. createRuntime 无 instance/execContext 时惰性装配（无副作用、不抛）
 *   2. createRuntime 完整装配（instance+execContext）：toolPort = ToolAdapter
 *   3. I-1 单一装配点 / S-1 无旁路：runner.deps.toolPort === ports.toolPort
 *   4. EngineFacade 绑定 EngineDeps（9 函数）
 *   5. runStep 端到端（completed）：Runner → Engine → Store
 *   6. describe() 自检（只读描述）
 *   7. 显式 executor 覆盖（向后兼容 mock 注入）
 *   8. runStep 缺 instance → CompositionError
 *   9. I-3 无副作用：createRuntime 本身不写盘
 *  10. 禁则：composition 模块不写宿主配置 / 不 resolveWorkspace
 *
 * 跑法：bun plugin/opencode/runtime/composition/test/composition.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Resolution } from "../../../workspace-resolver";
import type { AgentRuntimeInstance } from "../../../agent-instance";
import type { AgentRun } from "../../execution/types";
import type { AgentExecutionContext, ToolDeclaration } from "../../tool-bridge/context";
import type { ToolInvocationPort, ToolInvocationResult, AgentExecutor, AgentExecutorResult, RunnerInvocation, TaskInput } from "../../runner/types";
import { AgentExecutorImpl } from "../../agent-executor";
import { ToolAdapter } from "../../tool-adapter";
import { OpenCodeHostPort, type OpenCodeClientSubset } from "../../tool-adapter/host-port/host-port";
import {
  createRuntime,
  CompositionError,
  type CreateRuntimeInput,
} from "../index";

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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "myteam-composition-"));

function makeRes(suffix: string): Resolution {
  const projectRoot = path.join(root, `proj-${suffix}`);
  fs.mkdirSync(path.join(projectRoot, ".team"), { recursive: true });
  return {
    myteam_home: path.join(root, "myteam-home"),
    project_root: projectRoot,
    team_root: path.join(projectRoot, ".team"),
  };
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

function makeInstance(execution_id: string, workspace: string): AgentRuntimeInstance {
  return {
    id: `${execution_id}:coder`,
    agent: "coder",
    role: "code agent",
    prompt_source: path.join(root, "agents", "coder.md"),
    workspace,
    memory_namespace: path.join(workspace, ".team", "memory", "agents", "coder"),
    execution_id,
    permissions: ["read", "edit", "execute"],
    status: "bound",
    instance_dir: path.join(workspace, ".team", "runtime", "agent-instance", execution_id, "coder"),
  };
}

function makeContext(instance: AgentRuntimeInstance, tools: ToolDeclaration[] = []): AgentExecutionContext {
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
      deny_paths: [path.join(os.homedir(), ".config", "opencode")],
      host_config: path.join(os.homedir(), ".config", "opencode"),
      myteam_home: path.join(root, "myteam-home"),
    },
    persistence_target: instance.instance_dir,
  };
}

/** 最小宿主 client（组装层不触达；仅占位）。 */
const HOST_CLIENT: OpenCodeClientSubset = {};

function baseInput(res: Resolution, extra?: Partial<CreateRuntimeInput>): CreateRuntimeInput {
  return {
    resolution: res,
    host: { client: HOST_CLIENT, directory: res.project_root },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// 1. 惰性装配（无 instance/execContext）
// ---------------------------------------------------------------------------

console.log("== 1. inert assembly (no instance/execContext) ==");
{
  const res = makeRes("inert");
  const rt = createRuntime(baseInput(res));

  check("returns handle", Boolean(rt));
  check("hostPort is OpenCodeHostPort", rt.ports.hostPort instanceof OpenCodeHostPort);
  check("runner.deps undefined (inert)", rt.ports.runner.deps === undefined);

  const d = rt.describe();
  check("describe.hasInstance=false", d.hasInstance === false);
  check("describe.hasExecContext=false", d.hasExecContext === false);
  check("describe.toolPortKind=InertToolPort", d.toolPortKind === "InertToolPort");
  check("describe.readOnly=true", d.readOnly === true);

  // 惰性执行抛 CompositionError
  let threw = false;
  try {
    await rt.runStep({ run: makeRun() });
  } catch (e) {
    threw = e instanceof CompositionError;
  }
  check("runStep throws CompositionError (inert)", threw);
}

// ---------------------------------------------------------------------------
// 2. 完整装配
// ---------------------------------------------------------------------------

console.log("== 2. full assembly (instance+execContext) ==");
{
  const res = makeRes("full");
  const run = makeRun();
  const instance = makeInstance(run.execution_id, res.project_root);
  const ctx = makeContext(instance);
  const rt = createRuntime(baseInput(res, { instance, execContext: ctx }));

  check("toolPort is ToolAdapter", rt.ports.toolPort instanceof ToolAdapter);
  check("runner.deps defined", rt.ports.runner.deps !== undefined);
  check("instance bound", rt.instance === instance);
  check("execContext bound", rt.execContext === ctx);

  const d = rt.describe();
  check("describe.hasInstance=true", d.hasInstance === true);
  check("describe.hasExecContext=true", d.hasExecContext === true);
  check("describe.toolPortKind=ToolAdapter", d.toolPortKind === "ToolAdapter");
  check("describe.workspace=instance.workspace", d.workspace === instance.workspace);
}

// ---------------------------------------------------------------------------
// 3. I-1 / S-1：toolPort 同引用，无旁路
// ---------------------------------------------------------------------------

console.log("== 3. single assembly point / no bypass ==");
{
  const res = makeRes("ref");
  const run = makeRun();
  const instance = makeInstance(run.execution_id, res.project_root);
  const ctx = makeContext(instance);
  const rt = createRuntime(baseInput(res, { instance, execContext: ctx }));

  check("runner.deps.toolPort === ports.toolPort", rt.ports.runner.deps!.toolPort === rt.ports.toolPort);
  check("ports.toolPort is ToolAdapter", rt.ports.toolPort instanceof ToolAdapter);
  check("default executor is AgentExecutorImpl", rt.ports.runner.deps!.executor instanceof AgentExecutorImpl);
  check("describe.executorKind=AgentExecutorImpl", rt.describe().executorKind === "AgentExecutorImpl");
}

// ---------------------------------------------------------------------------
// 4. EngineFacade 绑定 EngineDeps（9 函数）
// ---------------------------------------------------------------------------

console.log("== 4. engine facade deps ==");
{
  const res = makeRes("engine");
  const rt = createRuntime(baseInput(res));
  const deps = rt.ports.engine.deps;
  const keys = [
    "load", "save", "saveRun", "loadRun", "listRuns",
    "listRunIds", "saveCheckpoint", "loadCheckpoint", "listCheckpoints",
  ];
  check("engine.deps has 9 functions", keys.every((k) => typeof (deps as any)[k] === "function"));
  check("engine facade exposes transition", typeof rt.ports.engine.transition === "function");
  check("engine facade exposes resolveCheckpoint", typeof rt.ports.engine.resolveCheckpoint === "function");

  // T3：engine.deps.load/save 转发到 Store（磁盘真相命中）
  const run = makeRun();
  const deps2 = rt.ports.engine.deps;
  const execFile = path.join(res.team_root, "runtime", "execution", run.execution_id, "execution.yaml");
  check("T3 execution not persisted before save", !fs.existsSync(execFile));
  deps2.save(res, {
    execution_id: run.execution_id,
    project: res.project_root,
    created: new Date().toISOString(),
    status: "received",
    current_stage: "",
    current_agent: "",
    result: "",
  });
  check("T3 engine.deps.save forwarded to Store (file exists)", fs.existsSync(execFile));
  const reloaded = deps2.load(res, run.execution_id);
  check("T3 engine.deps.load forwarded to Store (status=received)", reloaded?.status === "received");
  check("T3 engine.deps.listRunIds forwarded (empty)", deps2.listRunIds(res, run.execution_id).length === 0);
}

// ---------------------------------------------------------------------------
// 4b. createRuntime 幂等（T10）
// ---------------------------------------------------------------------------

console.log("== 4b. createRuntime idempotency ==");
{
  const res = makeRes("idem");
  const a = createRuntime(baseInput(res));
  const b = createRuntime(baseInput(res));
  check("T10 distinct handles", a !== b);
  check("T10 distinct hostPort instances", a.ports.hostPort !== b.ports.hostPort);
  check("T10 equivalent describe", JSON.stringify(a.describe()) === JSON.stringify(b.describe()));
}

// ---------------------------------------------------------------------------
// 5. runStep 端到端（completed）
// ---------------------------------------------------------------------------

console.log("== 5. runStep end-to-end (completed) ==");
{
  const res = makeRes("runstep");
  const run = makeRun();
  const instance = makeInstance(run.execution_id, res.project_root);
  const ctx = makeContext(instance);
  const rt = createRuntime(baseInput(res, { instance, execContext: ctx }));

  const step = await rt.runStep({ run });
  check("result.status=completed", step.result.status === "completed");
  check("result.output=goal", step.result.output === run.input);
  check("action.targetStatus=completed", step.action.targetStatus === "completed");
  check("execution.status=completed", step.execution.status === "completed");
  check("run.status=completed", step.run.status === "completed");

  // 磁盘真相：execution 落盘（store 布局：<team_root>/runtime/execution/<EX-xxx>/execution.yaml）
  const execFile = path.join(res.team_root, "runtime", "execution", run.execution_id, "execution.yaml");
  check("execution.yaml persisted", fs.existsSync(execFile));
}

// ---------------------------------------------------------------------------
// 5b. runStep 端到端（checkpoint_requested → paused + checkpoint 落盘）
// ---------------------------------------------------------------------------

console.log("== 5b. runStep end-to-end (checkpoint) ==");
{
  const res = makeRes("checkpoint");
  const run = makeRun();
  const instance = makeInstance(run.execution_id, res.project_root);
  const ctx = makeContext(instance);
  const mock: AgentExecutor = {
    async execute(): Promise<AgentExecutorResult> {
      return {
        ok: true,
        output: "need human",
        checkpointRequested: true,
        checkpointMessage: "confirm plan",
        checkpointOptions: ["approve", "reject"],
      };
    },
  };
  const rt = createRuntime(baseInput(res, { instance, execContext: ctx, executor: mock }));

  const step = await rt.runStep({ run });
  check("checkpoint result.status=checkpoint_requested", step.result.status === "checkpoint_requested");
  check("checkpoint nextAction=human_checkpoint", step.result.nextAction === "human_checkpoint");
  check("checkpoint action.targetStatus=paused", step.action.targetStatus === "paused");
  check("checkpoint execution.status=paused", step.execution.status === "paused");

  // checkpoint 落盘（store 布局：<team_root>/runtime/execution/<EX-xxx>/checkpoints/）
  const cps = rt.ports.engine.deps.listCheckpoints(res, run.execution_id);
  check("checkpoint persisted (>=1)", cps.length >= 1);
  check("checkpoint unresolved", cps[0]?.resolved_at === undefined);
  check("checkpoint message carries runner output", cps[0]?.message === "need human");
  check("checkpoint type=continue", cps[0]?.type === "continue");
}

// ---------------------------------------------------------------------------
// 5c. runStep 端到端（executor ok=false → Runner failed / agent_error）
// ---------------------------------------------------------------------------

console.log("== 5c. runStep end-to-end (executor failure) ==");
{
  const res = makeRes("exector-fail");
  const run = makeRun();
  const instance = makeInstance(run.execution_id, res.project_root);
  const ctx = makeContext(instance);
  const mock: AgentExecutor = {
    async execute(): Promise<AgentExecutorResult> {
      return { ok: false, output: "", error: "boom" };
    },
  };
  const rt = createRuntime(baseInput(res, { instance, execContext: ctx, executor: mock }));

  const step = await rt.runStep({ run });
  check("executor failure result.status=failed", step.result.status === "failed");
  check("executor failure nextAction=fail", step.result.nextAction === "fail");
  check("executor failure meta.error=agent_error", step.result.meta.error === "agent_error");
  check("executor failure action.targetStatus=failed", step.action.targetStatus === "failed");
  check("executor failure execution.status=failed", step.execution.status === "failed");
}

// ---------------------------------------------------------------------------
// 6. describe() 自检
// ---------------------------------------------------------------------------

console.log("== 6. describe self-check ==");
{
  const res = makeRes("describe");
  const run = makeRun();
  const instance = makeInstance(run.execution_id, res.project_root);
  const ctx = makeContext(instance);
  const rt = createRuntime(baseInput(res, { instance, execContext: ctx }));
  const d = rt.describe();
  check("describe.resolution === res", d.resolution === res);
  check("describe.hostPortKind=OpenCodeHostPort", d.hostPortKind === "OpenCodeHostPort");
  check("describe readOnly flag", d.readOnly === true);
}

// ---------------------------------------------------------------------------
// 7. 显式 executor 覆盖
// ---------------------------------------------------------------------------

console.log("== 7. explicit executor override ==");
{
  const res = makeRes("override");
  const run = makeRun();
  const instance = makeInstance(run.execution_id, res.project_root);
  const ctx = makeContext(instance);

  const calls: string[] = [];
  const mock: AgentExecutor = {
    async execute(ti: TaskInput): Promise<AgentExecutorResult> {
      calls.push(ti.goal);
      return { ok: true, output: "mock-output" };
    },
  };
  const rt = createRuntime(baseInput(res, { instance, execContext: ctx, executor: mock }));
  check("explicit executor wired", rt.ports.runner.deps!.executor === mock);

  const step = await rt.runStep({ run });
  check("mock executor invoked", calls.length === 1 && calls[0] === run.input);
  check("output=mock-output", step.result.output === "mock-output");
}

// ---------------------------------------------------------------------------
// 8. runStep 缺 instance → CompositionError
// ---------------------------------------------------------------------------

console.log("== 8. runStep requires instance ==");
{
  const res = makeRes("missing");
  const rt = createRuntime(baseInput(res));
  let threw = false;
  try {
    await rt.runStep({ run: makeRun() });
  } catch (e) {
    threw = e instanceof CompositionError;
  }
  check("runStep throws CompositionError without instance", threw);
}

// ---------------------------------------------------------------------------
// 9. I-3 无副作用：createRuntime 本身不写盘
// ---------------------------------------------------------------------------

console.log("== 9. no side effects on assembly ==");
{
  const res = makeRes("noside");
  const run = makeRun();
  const instance = makeInstance(run.execution_id, res.project_root);
  const ctx = makeContext(instance);
  const before = fs.readdirSync(res.team_root).sort().join(",");
  createRuntime(baseInput(res, { instance, execContext: ctx }));
  const after = fs.readdirSync(res.team_root).sort().join(",");
  check("team_root unchanged by assembly", before === after);
  check("no runtime/ dir created by assembly", !fs.existsSync(path.join(res.team_root, "runtime")));
}

// ---------------------------------------------------------------------------
// 10. 禁则：不写宿主配置 / 不 resolveWorkspace
// ---------------------------------------------------------------------------

console.log("== 10. forbidden behaviours ==");
{
  const src = fs.readFileSync(path.join(import.meta.dir, "..", "create-runtime.ts"), "utf8");
  check("no host-config write", !src.includes(".config") && !src.includes("opencode.json"));
  check("no resolveWorkspace call", !src.includes("resolveWorkspace"));
  check("no ensureTeamRoot call", !src.includes("ensureTeamRoot"));
  check("no activateAgent call", !src.includes("activateAgent"));
}

// ---------------------------------------------------------------------------

console.log("");
console.log(`===== composition: ${passed}/${passed + failed} PASS =====`);
if (failed > 0) process.exit(1);
