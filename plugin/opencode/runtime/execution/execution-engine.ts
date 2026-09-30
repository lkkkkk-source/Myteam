/**
 * MyTeam OpenCode Plugin — Execution Engine (execution-engine.ts) — v1.6.7
 * ---------------------------------------------------------------------------
 * Phase 6 — Execution Engine · Lifecycle Driver（生命周期驱动）。
 *
 * 公式：
 *   Execution Store (v1.6.5) + State Machine Rules = Execution Engine
 *
 * 职责：把 v1.6.5 Store 升级为“可管理任务执行生命周期”：
 *   1. transition / pause / resume / complete / fail —— 状态转移驱动
 *   2. AgentRun API：createRun / startRun / completeRun / failRun —— 只写 Store
 *   3. Checkpoint：resolveCheckpoint（continue / modify / reject）
 *
 * 严格范围（v1.6.7 强制）：
 *   - **不启动 Agent、不调用 Tool、不实现 Runner、不实现 Trace**。
 *   - Engine 是 Store 的读写者；Store 是磁盘唯一入口，Engine 不直接操作 fs。
 *   - 状态真相在磁盘（<project>/.team/runtime/execution/）；每次操作先 load 再判定，
 *     天然满足幂等重放与崩溃恢复。
 *
 * 状态枚举（沿用 v1.6.5，Engine 不新增）：
 *   received → planning → awaiting_confirmation → ready → running → paused → completed/failed
 * ---------------------------------------------------------------------------
 */

import type { ExecutionStatus, Execution, AgentRun, HumanCheckpoint } from "./types";
import type { Resolution } from "../../workspace-resolver";

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

/** 非法状态转移（不落盘）。 */
export class EngineTransitionError extends Error {
  readonly execution_id: string;
  readonly from: ExecutionStatus | "unknown";
  readonly to: ExecutionStatus;
  constructor(executionId: string, from: ExecutionStatus | "unknown", to: ExecutionStatus) {
    super(
      `[myteam-engine] illegal transition ${executionId}: ${from} -> ${to}`
    );
    this.execution_id = executionId;
    this.from = from;
    this.to = to;
  }
}

/** 重名 run 写入（防覆盖）。 */
export class EngineDuplicateRunError extends Error {
  readonly execution_id: string;
  readonly run_id: string;
  constructor(executionId: string, runId: string) {
    super(`[myteam-engine] duplicate run ${executionId}/${runId}`);
    this.execution_id = executionId;
    this.run_id = runId;
  }
}

/** execution 不存在。 */
export class EngineNotFoundError extends Error {
  readonly execution_id: string;
  constructor(executionId: string) {
    super(`[myteam-engine] execution not found: ${executionId}`);
    this.execution_id = executionId;
  }
}

/** checkpoint 已响应（防重复 resolve）。 */
export class EngineCheckpointResolvedError extends Error {
  readonly execution_id: string;
  readonly checkpoint_id: string;
  constructor(executionId: string, checkpointId: string) {
    super(`[myteam-engine] checkpoint already resolved: ${executionId}/${checkpointId}`);
    this.execution_id = executionId;
    this.checkpoint_id = checkpointId;
  }
}

/** run 状态非法（startRun 需 received；completeRun/failRun 需 running）。 */
export class EngineRunStateError extends Error {
  readonly run_id: string;
  readonly status: string;
  constructor(runId: string, status: string, action: string) {
    super(`[myteam-engine] cannot ${action} run ${runId} in status ${status}`);
    this.run_id = runId;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// 状态转移表（Engine 唯一合法转移来源）
// ---------------------------------------------------------------------------

/** 终态：完成后不得再转移。 */
const TERMINAL: ReadonlySet<ExecutionStatus> = new Set(["completed", "failed"]);

const TRANSITIONS: Readonly<Record<ExecutionStatus, ReadonlySet<ExecutionStatus>>> = {
  received: new Set(["planning", "failed"]),
  planning: new Set(["awaiting_confirmation", "ready", "failed"]),
  awaiting_confirmation: new Set(["ready", "planning", "failed"]),
  ready: new Set(["running", "paused", "failed"]),
  running: new Set(["awaiting_confirmation", "paused", "completed", "failed"]),
  paused: new Set(["ready", "running", "failed"]),
  completed: new Set(),
  failed: new Set(),
};

function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return TRANSITIONS[from].has(to);
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 纯数字 id 递增（run-0001 / cp-0001）；空目录返回 1。 */
export function nextId(prefix: string, existing: string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existing) {
    const m = id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// 1. State Driver：transition / pause / resume / complete / fail
// ---------------------------------------------------------------------------

export interface EngineDeps {
  load: (res: Resolution, executionId: string) => Execution | null;
  save: (res: Resolution, exec: Execution) => Execution;
  saveRun: (res: Resolution, run: AgentRun, runId: string) => string;
  loadRun: (res: Resolution, executionId: string, runId: string) => AgentRun | null;
  listRuns: (res: Resolution, executionId: string) => AgentRun[];
  /** 列出某 execution 的 runs/ 目录文件名（含 .yaml，升序），供 id 递增。 */
  listRunIds: (res: Resolution, executionId: string) => string[];
  saveCheckpoint: (res: Resolution, cp: HumanCheckpoint, executionId: string) => string;
  loadCheckpoint: (res: Resolution, executionId: string, cpId: string) => HumanCheckpoint | null;
  listCheckpoints: (res: Resolution, executionId: string) => HumanCheckpoint[];
}

/** 核心：load → validate → save。非法转移抛 EngineTransitionError，不写盘。 */
export function transition(
  res: Resolution,
  executionId: string,
  to: ExecutionStatus,
  deps: EngineDeps
): Execution {
  const cur = deps.load(res, executionId);
  if (!cur) throw new EngineNotFoundError(executionId);
  return transitionFrom(res, cur, to, deps);
}

/**
 * 内部：以给定当前态为起点转移（供恢复重放复用）。
 * 幂等：目标态 == 当前态 → no-op（不写盘）。
 * 终态幂等：completed/failed 上调用任何转移 → 返回当前态（不抛错、不写盘）。
 */
function transitionFrom(res: Resolution, cur: Execution, to: ExecutionStatus, deps: EngineDeps): Execution {
  // 终态幂等：目标 == 当前终态 → 直接返回
  if (cur.status === to) return cur;

  if (TERMINAL.has(cur.status)) {
    // 已终态：任何“不同目标”的转移一律拒绝（终态为吸收态）
    throw new EngineTransitionError(cur.execution_id, cur.status, to);
  }

  if (!canTransition(cur.status, to)) {
    throw new EngineTransitionError(cur.execution_id, cur.status, to);
  }

  const next: Execution = { ...cur, status: to };
  deps.save(res, next);
  return next;
}

/** running -> paused */
export function pause(res: Resolution, executionId: string, deps: EngineDeps): Execution {
  return transition(res, executionId, "paused", deps);
}

/** paused -> running */
export function resume(res: Resolution, executionId: string, deps: EngineDeps): Execution {
  return transition(res, executionId, "running", deps);
}

/** running -> completed */
export function complete(res: Resolution, executionId: string, deps: EngineDeps): Execution {
  return transition(res, executionId, "completed", deps);
}

/** 任意非终态 -> failed */
export function fail(res: Resolution, executionId: string, deps: EngineDeps): Execution {
  const cur = deps.load(res, executionId);
  if (!cur) throw new EngineNotFoundError(executionId);
  if (TERMINAL.has(cur.status)) return cur; // 终态幂等
  return transitionFrom(res, cur, "failed", deps);
}

// ---------------------------------------------------------------------------
// 2. AgentRun API（只写 Store；不启动 Agent）
// ---------------------------------------------------------------------------

/** 创建 run：递增 id（run-0001…）；status=received。 */
export function createRun(
  res: Resolution,
  exec: Execution,
  input: AgentRun["input"],
  agentInstanceId: string,
  deps: EngineDeps
): AgentRun {
  const existing = deps
    .listRunIds(res, exec.execution_id)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""));
  const runId = nextId("run", existing);
  const run: AgentRun = {
    execution_id: exec.execution_id,
    agent_instance_id: agentInstanceId,
    status: "received",
    input,
    output: "",
    started: now(),
  };
  deps.saveRun(res, run, runId);
  return run;
}

/** received -> running */
export function startRun(
  res: Resolution,
  executionId: string,
  runId: string,
  deps: EngineDeps
): AgentRun {
  const run = deps.loadRun(res, executionId, runId);
  if (!run) throw new EngineNotFoundError(runId);
  if (run.status === "running") return run; // 幂等
  if (run.status !== "received") {
    throw new EngineRunStateError(runId, run.status, "start");
  }
  const next: AgentRun = { ...run, status: "running" };
  deps.saveRun(res, next, runId);
  return next;
}

/** running -> completed */
export function completeRun(
  res: Resolution,
  executionId: string,
  runId: string,
  output: string,
  deps: EngineDeps
): AgentRun {
  const run = deps.loadRun(res, executionId, runId);
  if (!run) throw new EngineNotFoundError(runId);
  if (run.status === "completed") return run; // 幂等
  if (run.status !== "running") {
    throw new EngineRunStateError(runId, run.status, "complete");
  }
  const next: AgentRun = { ...run, status: "completed", output, completed: now() };
  deps.saveRun(res, next, runId);
  return next;
}

/** running -> failed */
export function failRun(
  res: Resolution,
  executionId: string,
  runId: string,
  output: string,
  deps: EngineDeps
): AgentRun {
  const run = deps.loadRun(res, executionId, runId);
  if (!run) throw new EngineNotFoundError(runId);
  if (run.status === "failed") return run; // 幂等
  if (run.status !== "running") {
    throw new EngineRunStateError(runId, run.status, "fail");
  }
  const next: AgentRun = { ...run, status: "failed", output, completed: now() };
  deps.saveRun(res, next, runId);
  return next;
}

// ---------------------------------------------------------------------------
// 3. Checkpoint：resolveCheckpoint（continue / modify / reject）
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** modify 时附带的修改意图。 */
  resolved?: string;
  /** 响应时间（缺省 now）。 */
  resolvedAt?: string;
}

/**
 * 人类响应 checkpoint。
 *   continue → awaiting_confirmation -> running
 *   modify   → awaiting_confirmation -> planning（携带 resolved）
 *   reject   → awaiting_confirmation -> failed（终态）
 * 幂等：已 resolved 的 cp 再次 resolve → 抛 EngineCheckpointResolvedError。
 */
export function resolveCheckpoint(
  res: Resolution,
  executionId: string,
  checkpointId: string,
  resolution: "continue" | "modify" | "reject",
  deps: EngineDeps,
  opts?: ResolveOptions
): { checkpoint: HumanCheckpoint; execution: Execution } {
  const exec = deps.load(res, executionId);
  if (!exec) throw new EngineNotFoundError(executionId);

  const cp = deps.loadCheckpoint(res, executionId, checkpointId);
  if (!cp) throw new EngineNotFoundError(checkpointId);
  if (cp.resolved_at) {
    throw new EngineCheckpointResolvedError(executionId, checkpointId);
  }

  // 一次响应 = 两个原子写：先落 cp，后转移状态。
  const resolvedAt = opts?.resolvedAt ?? now();
  const nextCp: HumanCheckpoint = {
    ...cp,
    resolution,
    resolved: opts?.resolved ?? cp.resolved,
    resolved_at: resolvedAt,
    acknowledged: true,
  };
  deps.saveCheckpoint(res, nextCp, executionId);

  // 状态转移（设计 §3.2 / §2.2 表）：
  //   continue → awaiting_confirmation -> ready -> running（两跳，每次一个原子写）
  //   modify   → awaiting_confirmation -> planning
  //   reject   → awaiting_confirmation -> failed（终态）
  let nextExec: Execution;
  if (resolution === "continue") {
    const ready = transitionFrom(res, exec, "ready", deps);
    nextExec = transitionFrom(res, ready, "running", deps);
  } else if (resolution === "modify") {
    nextExec = transitionFrom(res, exec, "planning", deps);
  } else {
    nextExec = transitionFrom(res, exec, "failed", deps);
  }
  return { checkpoint: nextCp, execution: nextExec };
}

// ---------------------------------------------------------------------------
// 4. Persistence Recovery（设计 §6）
// ---------------------------------------------------------------------------

/**
 * 崩溃恢复：重新 load 当前真相，若仍在非终态则返回供上层重放；
 * 若已终态则直接返回终态（幂等）。Engine 不自动重放，只提供"读真相"入口。
 */
export function recover(res: Resolution, executionId: string, deps: EngineDeps): Execution {
  const cur = deps.load(res, executionId);
  if (!cur) throw new EngineNotFoundError(executionId);
  // 真相全在磁盘；每次转移是单原子写 → 恢复 = 重读 + 重放剩余合法转移（无需日志回放）。
  return cur;
}
