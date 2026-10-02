/**
 * MyTeam OpenCode Plugin — Runner-Engine Adapter (runner-engine-adapter.ts) — v1.8.1
 * ---------------------------------------------------------------------------
 * Phase 8 — Runner/Engine Boundary · RunnerResult → Engine 状态转移映射。
 *
 * 公式：
 *   RunnerResult (v1.7.1)  ──┐
 *                             ├─ Adapter ──▶ Engine API (v1.6.7)
 *   AgentRun (v1.6.5)       ─┘
 *
 * 职责：把 Runner.execute() 的输出（RunnerResult）转换为
 *       Execution Engine 可驱动的状态转移与 Run 生命周期操作。
 *
 * 映射表（§3）：
 *   RunnerResult.status          →  Engine Action
 *   ---------------------------------------------
 *   "completed"                  →  startRun → completeRun → transition(completed)
 *   "checkpoint_requested"       →  startRun → pause → saveCheckpoint
 *   "failed" (timeout/cancel/tool_error/agent_error)
 *                                 →  startRun → failRun → transition(failed)
 *   "failed" (assertion_error)   →  抛错（Runner 自身契约破坏，不进 Engine）
 *
 * 禁则（强制）：
 *   - 不调用真实 Tool / 不启动 Agent / 不写 Home / 不碰 opencode.json。
 *   - 只读 RunnerResult；Engine 状态转移是唯一副作用（经 EngineDeps 落盘）。
 *   - 幂等：终态 execution 上的任何操作直接返回当前态（不抛错、不写盘）。
 *   - 本模块不实现 Trace；meta 字段原样透传（非 Trace 事件）。
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { RunnerResult, NextAction } from "./types";
import type {
  AgentRun,
  Execution,
  ExecutionStatus,
  HumanCheckpoint,
} from "../execution/types";
import type { EngineDeps } from "../execution/execution-engine";
import {
  startRun,
  completeRun,
  failRun,
  transition,
  nextId,
} from "../execution/execution-engine";
import type { Resolution } from "../../workspace-resolver";
import * as store from "../execution/execution-store";

// ---------------------------------------------------------------------------
// Adapter Output：从 RunnerResult 解析出的 Engine 动作 + 参数
// ---------------------------------------------------------------------------

export interface RunnerEngineAction {
  /** 期望的目标 execution 状态。 */
  targetStatus: ExecutionStatus;
  /** 是否创建 checkpoint（status=checkpoint_requested 时）。 */
  checkpoint: HumanCheckpoint | null;
  /** Runner 结果原文（用于 AgentRun.output 持久化）。 */
  runnerOutput: string;
  /** 错误类别（失败时）。 */
  errorKind?: RunnerResult["meta"]["error"];
  /** 错误细节（人类可读）。 */
  errorDetail?: string;
  /** 耗时统计（毫秒）。 */
  durationMs: number;
  /** Runner meta 透传（非 Trace 埋点，仅诊断标注）。 */
  meta: RunnerResult["meta"];
  /** Runner 的 nextAction（供上层调度参考；Adapter 不消费）。 */
  nextAction: NextAction;
}

// ---------------------------------------------------------------------------
// 核心：RunnerResult → Engine Action（纯函数，不写盘）
// ---------------------------------------------------------------------------

/**
 * 将 RunnerResult 解析为 Engine 可执行的 RunnerEngineAction。
 *
 * 规则：
 *   - completed → target=completed
 *   - checkpoint_requested → target=paused + checkpoint
 *   - failed（tool_error / agent_error / timeout / cancel）→ target=failed
 *   - failed（assertion_error）→ 抛错（不进 Engine）
 */
export function mapRunnerResultToEngineAction(
  result: RunnerResult,
  run: AgentRun
): RunnerEngineAction {
  const durationMs = result.meta.started
    ? Math.max(0, Date.now() - new Date(result.meta.started).getTime())
    : 0;

  // assertion_error 不进 Engine（Runner 自身契约破坏，需上层介入）
  if (result.status === "failed" && result.meta.error === "assertion_error") {
    throw new Error(
      `[myteam-adapter] assertion_error not mappable: ${result.meta.errorDetail ?? ""}`
    );
  }

  // checkpoint_requested（C-2 无损：优先取真实 message/options，仅缺失时兜底不覆盖）
  if (result.status === "checkpoint_requested") {
    const checkpoint: HumanCheckpoint = {
      checkpoint_id: "cp-0001", // 实际 id 由 saveCheckpoint 分配
      type: "continue",
      stage: "running",
      message: result.checkpoint?.message ?? (result.output || "checkpoint requested by runner"),
      required_action: "confirm or adjust",
      options: result.checkpoint?.options ?? ["continue", "modify", "reject"],
    };
    return {
      targetStatus: "paused",
      checkpoint,
      runnerOutput: result.output,
      durationMs,
      meta: result.meta,
      nextAction: result.nextAction,
    };
  }

  // completed
  if (result.status === "completed") {
    return {
      targetStatus: "completed",
      checkpoint: null,
      runnerOutput: result.output,
      durationMs,
      meta: result.meta,
      nextAction: result.nextAction,
    };
  }

  // failed（tool_error / agent_error / timeout / cancel）
  return {
    targetStatus: "failed",
    checkpoint: null,
    runnerOutput: result.output,
    errorKind: result.meta.error,
    errorDetail: result.meta.errorDetail,
    durationMs,
    meta: result.meta,
    nextAction: result.nextAction,
  };
}

// ---------------------------------------------------------------------------
// Engine 驱动：执行 RunnerEngineAction（唯一副作用入口）
// ---------------------------------------------------------------------------

/**
 * 把 RunnerEngineAction 驱动到 Engine 状态机。
 *
 * 流程（completed）：
 *   1. load execution → 若终态直接返回（幂等）
 *   2. startRun（received→running）→ completeRun（running→completed）
 *   3. transition execution 至 completed
 *
 * 流程（paused + checkpoint）：
 *   1. load execution → 若终态直接返回
 *   2. startRun（若 run 尚未 started）
 *   3. pause execution
 *   4. save checkpoint（供 resolveCheckpoint 消费）
 *
 * 流程（failed）：
 *   1. load execution → 若终态直接返回
 *   2. startRun（若 run 尚未 started）
 *   3. failRun（running→failed）
 *   4. transition execution 至 failed
 *
 * 返回 { execution, run }（两者均为磁盘最新真相的内存投影）。
 */
export async function executeRunnerResult(
  res: Resolution,
  run: AgentRun,
  result: RunnerResult,
  deps: EngineDeps,
  /** 可选：runId 文件标识（缺省取 run 的 agent_instance_id） */
  runId?: string
): Promise<{ execution: Execution; run: AgentRun; action: RunnerEngineAction }> {
  const action = mapRunnerResultToEngineAction(result, run);
  let effectiveRunId = runId ?? run.agent_instance_id;

  // 0. 读取当前 execution 真相（幂等判定）
  let exec = deps.load(res, run.execution_id);
  if (!exec) {
    // execution 尚未创建（首次 run）→ 创建并设为 ready
    exec = createExecutionIfMissing(res, run.execution_id, deps);
  }

  // 终态幂等：completed/failed 上不再转移
  if (exec.status === "completed" || exec.status === "failed") {
    return { execution: exec, run, action };
  }

  // 0.5 run 持久化保障：run 记录尚未落盘时先持久化（否则 lifecycle 无据可依）。
  //    优先使用调用方提供的 runId；缺省时按 Engine 递增规则分配（run-0001…）。
  let currentRun = deps.loadRun(res, run.execution_id, effectiveRunId);
  if (!currentRun) {
    const allocated = nextId(
      "run",
      deps.listRunIds(res, run.execution_id)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => f.replace(/\.yaml$/, ""))
    );
    const seeded: AgentRun = {
      ...run,
      status: "received",
      output: "",
    };
    deps.saveRun(res, seeded, allocated);
    currentRun = seeded;
    effectiveRunId = allocated;
  }

  // 1. 确保 run 状态为 running（允许 received→running）
  if (currentRun.status === "received") {
    currentRun = startRun(res, run.execution_id, effectiveRunId, deps);
  }

  // 1.5 execution 与 run 保持同步：ready → running（completed 转移的前置状态）
  if (exec.status === "ready") {
    exec = transition(res, run.execution_id, "running", deps);
  }

  // 2. 按 targetStatus 驱动
  if (action.targetStatus === "completed") {
    currentRun = completeRun(
      res,
      run.execution_id,
      effectiveRunId,
      action.runnerOutput,
      deps
    );
    exec = transition(res, run.execution_id, "completed", deps);
  } else if (action.targetStatus === "paused") {
    // pause execution + 保存 checkpoint
    exec = transition(res, run.execution_id, "paused", deps);
    if (action.checkpoint) {
      deps.saveCheckpoint(res, action.checkpoint, run.execution_id);
    }
  } else {
    // failed
    currentRun = failRun(
      res,
      run.execution_id,
      effectiveRunId,
      action.runnerOutput || action.errorDetail || "unknown error",
      deps
    );
    exec = transition(res, run.execution_id, "failed", deps);
  }

  return { execution: exec, run: currentRun, action };
}

// ---------------------------------------------------------------------------
// 内部：创建 execution（若不存在）
// ---------------------------------------------------------------------------

function createExecutionIfMissing(
  res: Resolution,
  executionId: string,
  _deps: EngineDeps
): Execution {
  // 直接调用 store.create（经 assertValidExecutionId + 安全域检查）
  const exec: Execution = {
    execution_id: executionId,
    project: res.project_root.replace(/\\/g, "/"),
    created: new Date().toISOString(),
    status: "ready",
    current_stage: "initialization",
    current_agent: "",
    result: "",
  };
  return store.create(res, exec);
}
