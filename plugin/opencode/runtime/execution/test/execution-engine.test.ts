/**
 * MyTeam OpenCode Plugin — Execution Engine Smoke Test (execution-engine.test.ts) — v1.6.7
 * ---------------------------------------------------------------------------
 * 验证 6 项：
 *   1. state transition     2. invalid transition    3. idempotent terminal state
 *   4. checkpoint flow      5. run lifecycle         6. persistence recovery
 *
 * 用真实 Store（execution-store.ts）作 deps，Engine 只驱动生命周期、不启动 Agent。
 * 跑法：bun plugin/opencode/runtime/execution/test/execution-engine.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Execution, AgentRun, HumanCheckpoint } from "../types";
import type { Resolution } from "../../../workspace-resolver";
import * as store from "../execution-store";
import {
  transition,
  pause,
  resume,
  complete,
  fail,
  createRun,
  startRun,
  completeRun,
  failRun,
  resolveCheckpoint,
  recover,
  EngineTransitionError,
  EngineDuplicateRunError,
  EngineCheckpointResolvedError,
  EngineRunStateError,
  EngineNotFoundError,
  type EngineDeps,
} from "../execution-engine";

// ---------------------------------------------------------------------------
// 测试基建：真实 Store 作 deps + 临时项目目录
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

function makeRes(root: string): Resolution {
  const projectRoot = path.join(root, "proj");
  fs.mkdirSync(path.join(projectRoot, ".team", "runtime"), { recursive: true });
  return {
    myteam_home: path.join(root, "home"),
    project_root: projectRoot,
    team_root: path.join(projectRoot, ".team"),
  };
}

/** Engine deps：全部转发给真实 Store。 */
function realDeps(): EngineDeps {
  return {
    load: (r, id) => store.load(r, id),
    save: (r, e) => store.save(r, e),
    saveRun: (r, run, runId) => store.saveRun(r, run, runId),
    loadRun: (r, id, runId) => store.loadRun(r, id, runId),
    listRuns: (r, id) => store.listRuns(r, id),
    listRunIds: (r, id) => {
      const dir = store.runsDir(r, id);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).sort();
    },
    saveCheckpoint: (r, cp, id) => store.saveCheckpoint(r, cp, id),
    loadCheckpoint: (r, id, cpId) => store.loadCheckpoint(r, id, cpId),
    listCheckpoints: (r, id) => store.listCheckpoints(r, id),
  };
}

function makeExec(res: Resolution, id: string): Execution {
  return {
    execution_id: id,
    project: res.project_root,
    created: new Date().toISOString(),
    status: "received",
    current_stage: "",
    current_agent: "",
    result: store.resultDir(res, id),
  };
}

// 每个 section 用独立临时根，避免相互污染
const root = fs.mkdtempSync(path.join(os.tmpdir(), "myteam-engine-"));
const res = makeRes(root);

// ---------------------------------------------------------------------------
// 1. State Transition
// ---------------------------------------------------------------------------
console.log("== 1. state transition ==");
{
  const deps = realDeps();
  const exec = makeExec(res, "EX-001");
  store.create(res, exec);

  check("received -> planning", transition(res, "EX-001", "planning", deps).status === "planning");
  check("planning -> ready", transition(res, "EX-001", "ready", deps).status === "ready");
  check("ready -> running", transition(res, "EX-001", "running", deps).status === "running");
  check("running -> paused", pause(res, "EX-001", deps).status === "paused");
  check("paused -> running", resume(res, "EX-001", deps).status === "running");
  check("running -> completed", complete(res, "EX-001", deps).status === "completed");
  check("status persisted on disk", store.load(res, "EX-001")!.status === "completed");
}

// ---------------------------------------------------------------------------
// 2. Invalid Transition（不落盘）
// ---------------------------------------------------------------------------
console.log("== 2. invalid transition ==");
{
  const deps = realDeps();
  const exec = makeExec(res, "EX-002");
  store.create(res, exec);

  let threw = false;
  try {
    transition(res, "EX-002", "running", deps); // received -> running 非法
  } catch (e) {
    threw = e instanceof EngineTransitionError;
  }
  check("received -> running rejected", threw);
  check("no write on invalid transition", store.load(res, "EX-002")!.status === "received");

  threw = false;
  try {
    transition(res, "EX-002", "completed", deps); // received -> completed 非法
  } catch (e) {
    threw = e instanceof EngineTransitionError;
  }
  check("received -> completed rejected", threw);
  check("still received on disk", store.load(res, "EX-002")!.status === "received");
}

// ---------------------------------------------------------------------------
// 3. Idempotent Terminal State
// ---------------------------------------------------------------------------
console.log("== 3. idempotent terminal state ==");
{
  const deps = realDeps();
  const exec = makeExec(res, "EX-003");
  store.create(res, exec);
  transition(res, "EX-003", "planning", deps);
  transition(res, "EX-003", "ready", deps);
  transition(res, "EX-003", "running", deps);
  complete(res, "EX-003", deps);

  check("completed is terminal", store.load(res, "EX-003")!.status === "completed");
  check("complete on completed -> no-op",
    complete(res, "EX-003", deps).status === "completed");
  check("fail on completed -> no-op",
    fail(res, "EX-003", deps).status === "completed");
  check("resume on completed -> rejected", (() => {
    let t = false;
    try { resume(res, "EX-003", deps); } catch (e) { t = e instanceof EngineTransitionError; }
    return t;
  })());

  // failed 终态
  const exec2 = makeExec(res, "EX-007");
  store.create(res, exec2);
  transition(res, "EX-007", "planning", deps);
  fail(res, "EX-007", deps);
  check("fail on failed -> no-op", fail(res, "EX-007", deps).status === "failed");
  check("resume on failed -> rejected", (() => {
    let t = false;
    try { resume(res, "EX-007", deps); } catch (e) { t = e instanceof EngineTransitionError; }
    return t;
  })());
}

// ---------------------------------------------------------------------------
// 4. Checkpoint Flow
// ---------------------------------------------------------------------------
console.log("== 4. checkpoint flow ==");
{
  const deps = realDeps();
  const exec = makeExec(res, "EX-004");
  store.create(res, exec);
  transition(res, "EX-004", "planning", deps);
  transition(res, "EX-004", "ready", deps);
  transition(res, "EX-004", "running", deps);

  // 进入 awaiting_confirmation：Engine 落 cp + 转移
  const cp: HumanCheckpoint = {
    checkpoint_id: "cp-0001",
    type: "continue",
    stage: "review",
    message: "请确认方案",
    required_action: "continue/modify/reject",
    options: ["continue", "modify", "reject"],
  };
  store.saveCheckpoint(res, cp, "EX-004");
  transition(res, "EX-004", "awaiting_confirmation", deps);

  check("running -> awaiting_confirmation", store.load(res, "EX-004")!.status === "awaiting_confirmation");

  // continue → running
  const r1 = resolveCheckpoint(res, "EX-004", "cp-0001", "continue", deps);
  check("continue -> running", r1.execution.status === "running");
  check("cp resolved", r1.checkpoint.resolution === "continue" && !!r1.checkpoint.resolved_at);
  check("cp persisted", store.loadCheckpoint(res, "EX-004", "cp-0001")!.resolved_at !== undefined);

  // 重复 resolve → 抛错
  let dup = false;
  try {
    resolveCheckpoint(res, "EX-004", "cp-0001", "modify", deps);
  } catch (e) {
    dup = e instanceof EngineCheckpointResolvedError;
  }
  check("double resolve rejected", dup);

  // modify → planning
  const exec2 = makeExec(res, "EX-008");
  store.create(res, exec2);
  transition(res, "EX-008", "planning", deps);
  transition(res, "EX-008", "ready", deps);
  transition(res, "EX-008", "running", deps);
  const cp2: HumanCheckpoint = {
    checkpoint_id: "cp-0001",
    type: "modify",
    stage: "review",
    message: "请提出修改",
    required_action: "modify",
    options: ["continue", "modify"],
  };
  store.saveCheckpoint(res, cp2, "EX-008");
  transition(res, "EX-008", "awaiting_confirmation", deps);
  const r2 = resolveCheckpoint(res, "EX-008", "cp-0001", "modify", deps, { resolved: "改用 SQLite" });
  check("modify -> planning", r2.execution.status === "planning");
  check("modify carries resolved", r2.checkpoint.resolved === "改用 SQLite");

  // reject → failed
  const exec3 = makeExec(res, "EX-009");
  store.create(res, exec3);
  transition(res, "EX-009", "planning", deps);
  transition(res, "EX-009", "ready", deps);
  transition(res, "EX-009", "running", deps);
  const cp3: HumanCheckpoint = {
    checkpoint_id: "cp-0001",
    type: "reject",
    stage: "review",
    message: "请否决",
    required_action: "reject",
    options: ["reject"],
  };
  store.saveCheckpoint(res, cp3, "EX-009");
  transition(res, "EX-009", "awaiting_confirmation", deps);
  const r3 = resolveCheckpoint(res, "EX-009", "cp-0001", "reject", deps);
  check("reject -> failed", r3.execution.status === "failed");
}

// ---------------------------------------------------------------------------
// 5. Run Lifecycle
// ---------------------------------------------------------------------------
console.log("== 5. run lifecycle ==");
{
  const deps = realDeps();
  const exec = makeExec(res, "EX-005");
  store.create(res, exec);
  transition(res, "EX-005", "planning", deps);
  transition(res, "EX-005", "ready", deps);

  const run1 = createRun(res, exec, "任务输入", "inst-1", deps);
  check("run-0001 created", store.loadRun(res, "EX-005", "run-0001")?.status === "received");
  check("run-0001 id", run1.execution_id === "EX-005");
  check("createRun does not touch execution status", store.load(res, "EX-005")!.status === "ready");

  startRun(res, "EX-005", "run-0001", deps);
  check("run-0001 -> running", store.loadRun(res, "EX-005", "run-0001")!.status === "running");
  check("startRun leaves execution as ready (run/execution states independent)",
    store.load(res, "EX-005")!.status === "ready");

  completeRun(res, "EX-005", "run-0001", "产出 A", deps);
  check("run-0001 -> completed", store.loadRun(res, "EX-005", "run-0001")!.status === "completed");
  check("run output persisted", store.loadRun(res, "EX-005", "run-0001")!.output === "产出 A");

  // 第二个 run：递增 id
  const run2 = createRun(res, exec, "任务输入2", "inst-2", deps);
  check("run-0002 auto-increment", (() => {
    const files = fs.readdirSync(store.runsDir(res, "EX-005")).sort();
    return files.includes("run-0002.yaml");
  })());

  // complete 已完成的 run → 幂等
  const done = completeRun(res, "EX-005", "run-0001", "产出 A", deps);
  check("complete completed run -> no-op", done.status === "completed");

  // 对 received 的 run 调用 completeRun → 抛错
  let bad = false;
  try { completeRun(res, "EX-005", "run-0002", "x", deps); } catch (e) {
    bad = e instanceof EngineRunStateError;
  }
  check("complete received run rejected", bad);

  // failRun
  const run3 = createRun(res, exec, "任务输入3", "inst-3", deps);
  startRun(res, "EX-005", "run-0003", deps);
  failRun(res, "EX-005", "run-0003", "崩溃了", deps);
  check("run-0003 -> failed", store.loadRun(res, "EX-005", "run-0003")!.status === "failed");
  check("run-0003 output persisted", store.loadRun(res, "EX-005", "run-0003")!.output === "崩溃了");
}

// ---------------------------------------------------------------------------
// 6. Persistence Recovery
// ---------------------------------------------------------------------------
console.log("== 6. persistence recovery ==");
{
  const deps = realDeps();
  const exec = makeExec(res, "EX-006");
  store.create(res, exec);
  transition(res, "EX-006", "planning", deps);
  transition(res, "EX-006", "ready", deps);
  transition(res, "EX-006", "running", deps);

  // 模拟崩溃：丢弃内存 deps，用新 deps 重读磁盘真相
  const freshDeps = realDeps();
  const recovered = recover(res, "EX-006", freshDeps);
  check("recover reloads current state", recovered.status === "running");
  check("recover reloads from disk", store.load(res, "EX-006")!.status === "running");

  // 终态 recovery：recover 已 completed 的 execution
  complete(res, "EX-006", freshDeps);
  const recovered2 = recover(res, "EX-006", realDeps());
  check("recover on completed returns terminal", recovered2.status === "completed");

  // 非法 recovery id → 抛错
  let nf = false;
  try { recover(res, "EX-999", realDeps()); } catch (e) {
    nf = e instanceof EngineNotFoundError;
  }
  check("recover missing execution throws", nf);

  // 崩溃后重放：新 execution 到 running，模拟崩溃 → recover 读真相 → 继续暂停/恢复
  const exec2 = makeExec(res, "EX-010");
  store.create(res, exec2);
  transition(res, "EX-010", "planning", realDeps());
  transition(res, "EX-010", "ready", realDeps());
  transition(res, "EX-010", "running", realDeps());

  // 模拟崩溃：丢弃全部内存引用，用全新 deps 重放
  const replay1 = recover(res, "EX-010", realDeps());
  check("replay after crash reloads running", replay1.status === "running");
  pause(res, "EX-010", realDeps());
  const replay2 = recover(res, "EX-010", realDeps());
  check("replay reloads paused", replay2.status === "paused");
  resume(res, "EX-010", realDeps());
  const replay3 = recover(res, "EX-010", realDeps());
  check("replay reaches running again", replay3.status === "running");
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log(`\n===== execution-engine: ${passed}/${passed + failed} PASS =====`);
if (failed > 0) {
  console.error(`[myteam-engine] ${failed} check(s) FAILED`);
  process.exit(1);
}
