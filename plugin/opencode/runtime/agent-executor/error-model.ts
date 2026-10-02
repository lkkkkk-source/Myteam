/**
 * MyTeam OpenCode Plugin — Agent Executor · Error Model (error-model.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 3 — 执行体错误模型（设计 §8）。
 *
 * 职责：
 *   把执行管线内部产生的错误归一为有限类别（AgentErrorKind），并折叠为
 *   AgentExecutorResult 失败结果（不外泄裸异常，E-1 / E-4）。
 *
 * 使用：
 *   - 管线内部需要带分类抛出时，抛出 `AgentError`（携带 AgentErrorKind）。
 *   - execute() 的 catch-all 调用 `buildFailure` 折叠为失败结果。
 *   - `buildFailure` 把分类编码进 `error` 字符串（`[<kind>] <detail>`），
 *     供 Runner / 日志做可诊断折叠（设计 §8.3 落点；AgentExecutorResult 无 error_kind 字段）。
 *
 * 硬性禁则（本阶段强制）：
 *   - 不 import 网络 / SDK / fs（除纯内存计算）。
 *   - 只使用 §8.2 枚举值；不引入供应商专有错误串（E-2）。
 * ---------------------------------------------------------------------------
 */

import type { AgentErrorKind } from "../model/types";
import type { AgentExecutorResult } from "../runner/types";

/**
 * 归一错误 —— 带分类的执行体内部异常。
 *
 * 用于把「模型段 / 校验段 / 工具段」的错误显式归类，沿 execute() 上抛，
 * 由 catch-all 折叠为 AgentExecutorResult（遵循 §8.4 优先级）。
 * 不与宿主 / 供应商异常混同：宿主取消仍以 AbortSignal / AbortError 表达。
 */
export class AgentError extends Error {
  /** 归一错误类别（设计 §8.2）。 */
  readonly kind: AgentErrorKind;

  constructor(kind: AgentErrorKind, message: string) {
    super(`[myteam-agent-executor] ${message}`);
    this.name = "AgentError";
    this.kind = kind;
  }
}

/**
 * 把归一错误折叠为失败 AgentExecutorResult。
 *
 * 不变量（设计 §8.5）：
 *   - 恒 ok=false（E-4 不吞错）。
 *   - error 附人读细节，不含凭据（E-3）。
 *   - 不填 checkpoint 字段（失败不请求人工确认，C-3）。
 */
export function buildFailure(
  errorKind: AgentErrorKind,
  detail: string
): AgentExecutorResult {
  return {
    ok: false,
    output: "",
    artifacts: [],
    error: `[${errorKind}] ${detail}`,
  };
}

/**
 * 从任意异常折叠为失败结果（execute() catch-all）。
 *
 * 优先级（设计 §8.4）：AgentError（显式分类）优先；
 * 其余未知异常由调用方决定归类（默认 agent_error）。
 */
export function collapseError(e: unknown): AgentExecutorResult {
  if (e instanceof AgentError) {
    return buildFailure(e.kind, e.message);
  }
  return buildFailure(
    "agent_error",
    e instanceof Error ? e.message : String(e)
  );
}