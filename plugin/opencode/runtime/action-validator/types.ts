/**
 * MyTeam OpenCode Plugin — Action Validator · Types (types.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 2 — Action Validation（动作校验 · 唯一放行闸门）· 类型模型。
 *
 * 核心命题（设计 §6.1 / 题干强制）：
 *   **模型输出不能直接执行。** 解析出的 tool_calls 只是模型意图，
 *   必须逐项校验后才可经 ToolInvocationPort 下发。
 *
 * 记录：
 *   - RawToolCall（untrusted 意图）→ ActionValidator → ValidatedActions（可信/拒绝）。
 *   - 校验通过的调用产出 `ToolInvocationRequest`（可直接交回 toolPort，设计 §6.3）。
 *   - Fail-Closed（设计 §9.3 SX-6）：任一校验失败 → 整批不产生 requests（不降级绕过）。
 *
 * 禁则（本阶段强制）：
 *   - 纯计算、不读盘、不调用工具、不发起宿主/MCP、无副作用。
 *   - 不修改 AgentExecutionContext（只读消费，设计 P-4）。
 *   - 不 import host-port / tool-adapter / node:fs / 网络 SDK。
 * ---------------------------------------------------------------------------
 */

import type { AgentErrorKind } from "../model/types";
import type { ParsedAgentResponse, RawToolCall } from "../response-parser/types";
import type { ToolInvocationRequest } from "../runner/types";

/** 单个工具调用的校验结论（逐项明细，审计用）。 */
export interface ActionVerdict {
  /** 工具名。 */
  tool: string;
  /** 是否通过校验。 */
  ok: boolean;
  /** 校验通过的检查项（ok=true，审计）。 */
  passed?: string[];
  /** 拒绝分类（ok=false）：结构/未声明 → invalid_response；权限/安全域 → tool_denied。 */
  error_kind?: "invalid_response" | "tool_denied";
  /** 拒绝原因（人类可读）。 */
  reason?: string;
}

/** 被拒绝的工具调用（留存原意图 + 拒绝分类，审计用）。 */
export interface RejectedToolCall {
  /** 原始模型意图。 */
  raw: RawToolCall;
  /** 拒绝分类。 */
  error_kind: "invalid_response" | "tool_denied";
  /** 拒绝原因。 */
  reason: string;
}

/** 通过校验的工具调用（可直接下发）。 */
export interface ValidatedToolCall {
  /** 校验通过、可直接交回 toolPort 的请求。 */
  request: ToolInvocationRequest;
  /** 原始模型意图（审计）。 */
  raw: RawToolCall;
  /** 通过项清单（审计）。 */
  passed: string[];
}

/**
 * ActionValidator 产物。
 *
 * 不变量（设计 §9.3）：
 *   - ok=false 时绝不携带 `requests`（Fail-Closed）。
 *   - requests 中的每一项都通过「声明/来源/权限/安全域/宿主配置黑名单」全部检查。
 */
export type ValidatedActions =
  | {
      ok: true;
      kind: "answer";
      answer: { text: string; artifacts?: string[] };
      truncated?: boolean;
    }
  | {
      ok: true;
      kind: "checkpoint";
      checkpoint: { message: string; options?: string[] };
      truncated?: boolean;
    }
  | {
      ok: true;
      kind: "tool_calls";
      /** 全部通过校验、可直接下发的请求。 */
      requests: ToolInvocationRequest[];
      /** 已通过校验的调用（含原始意图）。 */
      calls: ValidatedToolCall[];
      /** 逐项校验明细。 */
      verdicts: ActionVerdict[];
      /** 模型备注透传。 */
      note?: string;
    }
  | {
      ok: false;
      kind: "invalid";
      /** 归一错误分类。 */
      error_kind: AgentErrorKind;
      /** 人类可读原因。 */
      reason: string;
      truncated?: boolean;
    }
  | {
      ok: false;
      kind: "tool_calls";
      /** 归一错误分类：tool_denied（权限/安全域）或 invalid_response（结构/未声明）。 */
      error_kind: "tool_denied" | "invalid_response";
      /** 人类可读原因。 */
      reason: string;
      /** 被拒绝项清单。 */
      rejected: RejectedToolCall[];
      /** 逐项校验明细。 */
      verdicts: ActionVerdict[];
      /** 模型备注透传。 */
      note?: string;
    };

/** ActionValidator 的输入（ParsedAgentResponse 已解析但未校验）。 */
export interface ActionValidationInput {
  /** Response Parser 的产物（untrusted）。 */
  parsed: ParsedAgentResponse;
  /** AgentExecutionContext（只读：tools + security）。 */
  context: import("../tool-bridge/context").AgentExecutionContext;
}