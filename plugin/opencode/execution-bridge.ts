/**
 * MyTeam OpenCode Plugin — Execution Bridge (execution-bridge.ts) — v1.2
 * ---------------------------------------------------------------------------
 * MyTeam Execution Engine  →  OpenCode Runtime。
 *
 * 职责：把【已经批准 + 已授权 permission】的 Execution Request 桥接到 OpenCode
 *       runtime（tool / MCP / shell），并把结果回连 Quality / Observability。
 *
 * 硬性边界（强制）：
 *   - 只执行 status=authorized 且引用 approved action 的 Execution Request；
 *   - Plugin 不自己生成 Action（禁止 auto-action-generation）；
 *   - 不绕过 permission / 不跳过 quality / 不自动提权；
 *   - 不写 ~/.config/opencode（宿主隔离，继承 v1.0.1）。
 */

import { guardHostWrite } from "./bridge";

export interface ExecutionRequestView {
  execution_id: string;
  action_ref: string;
  task_id: string;
  executor: string;
  status: string;             // must be "authorized" to be admissible
  permission_granted: boolean;
  action_approved: boolean;
}

export interface ExecutionAdmission {
  admissible: boolean;
  reason: string;
}

/**
 * 准入校验：一次 Execution Request 是否允许经 Bridge 进入 OpenCode runtime。
 * 只做 gate 判断，不真正执行（真实执行为受治理引擎 + 未来运行时）。
 */
export function admitExecution(req: ExecutionRequestView): ExecutionAdmission {
  if (!req.action_approved) {
    return { admissible: false, reason: `action ${req.action_ref} not approved (ee-1)` };
  }
  if (!req.permission_granted) {
    return { admissible: false, reason: `permission not granted for ${req.execution_id} (ee-2)` };
  }
  if (req.status !== "authorized" && req.status !== "queued") {
    return { admissible: false, reason: `execution ${req.execution_id} status=${req.status} not authorized` };
  }
  return { admissible: true, reason: "approved action + granted permission + authorized" };
}

/**
 * Plugin 侧硬边界：Bridge 不得生成 Action。
 * 任何"由 plugin 创建 action"的调用都被拒绝。
 */
export function refuseActionGeneration(source: string): never {
  throw new Error(`[myteam-execution] plugin must not generate Action (source=${source}); use Agent → Action → Approval → Engine`);
}

/** 结果回连：确保执行结果落到 Quality / Observability（不跳过 quality）。 */
export function requireQualityLink(result: { quality_ref?: string; errors?: string[] }): void {
  const failed = (result.errors?.length ?? 0) > 0;
  if (!failed && !result.quality_ref) {
    throw new Error("[myteam-execution] completed execution must connect Quality Gate (no skip_quality)");
  }
}

/** 执行前的宿主写守卫（继承 v1.0.1 隔离）。 */
export function guardExecutionTarget(targetPath: string): void {
  guardHostWrite(targetPath);
}
