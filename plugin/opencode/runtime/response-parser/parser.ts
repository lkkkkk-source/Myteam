/**
 * MyTeam OpenCode Plugin — Response Parser (parser.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 2 — Response Parser（模型输出 → ParsedAgentResponse）。
 *
 * 职责（设计 §5）：
 *   把 ModelResponse.text **严格解析**为执行层可消费的结构化对象。
 *   模型输出**不可信**，必须经过解析 + 结构校验。
 *
 * 解析规则：
 *   - R-1 严格模式     ：expects="json" 时必须是合法 JSON；解析失败 → { kind:"invalid" }。
 *   - R-2 结构校验     ：tool_calls[].tool 必须为非空字符串；arguments 必须为对象。
 *   - R-3 不信任字段   ：解析器不在此判定工具合法性/权限（那是 ActionValidator 的职责）。
 *   - R-4 无执行       ：解析器绝不调用工具、绝不写盘；纯转换。
 *   - R-5 安全截断     ：超长文本按上限截断（防 DoS），并标注 truncated。
 *
 * 硬性禁则（本阶段强制）：
 *   - **不 import fs / net / sdk**；不写盘、不联网、无副作用。
 *   - **不判定工具合法性**（tool ∈ context.tools / allowed / 安全域 → ActionValidator）。
 * ---------------------------------------------------------------------------
 */

import type { AgentErrorKind, ModelResponse } from "../model/types";
import {
  MAX_RESPONSE_RAW_LENGTH,
  MAX_RESPONSE_TEXT_LENGTH,
  MAX_TOOL_CALLS,
  type ParsedAgentResponse,
  type RawToolCall,
  type ResponseParseOptions,
} from "./types";

// ---------------------------------------------------------------------------
// 纯工具函数（确定性、无副作用）
// ---------------------------------------------------------------------------

/** R-5：按上限截断文本（截断则标注 truncated）。 */
function truncate(text: string, limit: number): { text: string; truncated: boolean } {
  if (limit > 0 && text.length > limit) {
    return { text: text.slice(0, limit), truncated: true };
  }
  return { text, truncated: false };
}

/** R-5：原始响应硬截断（防 DoS；JSON 残缺 → invalid）。 */
function truncateRaw(text: string): { text: string; truncated: boolean } {
  if (text.length > MAX_RESPONSE_RAW_LENGTH) {
    return { text: text.slice(0, MAX_RESPONSE_RAW_LENGTH), truncated: true };
  }
  return { text, truncated: false };
}

/** R-2：tool 必须为非空字符串。 */
function isNonNullString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** R-2：arguments 必须为普通对象（非 null / 非数组）。 */
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** R-2：校验单个 RawToolCall 的结构（不判定合法性，R-3）。 */
function toRawToolCall(value: unknown): RawToolCall | null {
  if (!isPlainRecord(value)) return null;
  const tool = (value as { tool?: unknown }).tool;
  if (!isNonNullString(tool)) return null;
  const args = (value as { arguments?: unknown }).arguments;
  if (!isPlainRecord(args)) return null;
  const source = (value as { source?: unknown }).source;
  const call: RawToolCall = { tool, arguments: args as Record<string, unknown> };
  if (source === "host" || source === "mcp") call.source = source;
  return call;
}

/**
 * R-1 严格模式：解析 JSON 文本。
 * 失败（语法错误 / 非对象）→ 返回 null；不抛异常。
 */
function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return isPlainRecord(v) ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 核心解析
// ---------------------------------------------------------------------------

/**
 * parse —— 把 ModelResponse 解析为 ParsedAgentResponse。
 *
 * 纯函数：相同输入 → 相同输出；无 fs、无网络、无副作用、不抛异常
 * （任何解析异常都折叠为 { kind:"invalid" }）。
 *
 * @param response 模型统一响应（模型输出不可信）。
 * @param options 解析选项（expects / 截断上限）。
 */
export function parse(
  response: ModelResponse,
  options: ResponseParseOptions = {}
): ParsedAgentResponse {
  const expects = options.expects ?? "json";
  const maxTextLength = options.maxTextLength ?? MAX_RESPONSE_TEXT_LENGTH;
  const maxToolCalls = options.maxToolCalls ?? MAX_TOOL_CALLS;

  // 模型失败（网络/鉴权/取消等）→ 无可解析文本 → invalid。
  if (!response.ok) {
    const errorKind: AgentErrorKind = response.error_kind ?? "model_error";
    return {
      kind: "invalid",
      reason: response.error_detail || `model failed (${errorKind})`,
      errorKind,
    };
  }

  // R-5 原始硬截断（防 DoS）：超长原文先截断；JSON 残缺则解析失败 → invalid。
  const rawGuard = truncateRaw(response.text);

  if (expects === "text") {
    const t = truncate(rawGuard.text, maxTextLength);
    if (t.text.trim().length === 0) {
      return { kind: "invalid", reason: "empty response text", errorKind: "invalid_response" };
    }
    return {
      kind: "answer",
      text: t.text,
      truncated: t.truncated || rawGuard.truncated,
    };
  }

  // R-1 严格模式：必须是合法 JSON 且外层为对象。
  const raw = tryParseJson(rawGuard.text);
  if (raw === null) {
    return {
      kind: "invalid",
      reason: "response is not valid JSON object",
      errorKind: "invalid_response",
      truncated: rawGuard.truncated,
    };
  }

  const kind = (raw as { kind?: unknown }).kind;

  switch (kind) {
    case "answer":
      return parseAnswer(raw, maxTextLength, rawGuard.truncated);
    case "tool_calls":
      return parseToolCalls(raw, maxToolCalls, rawGuard.truncated);
    case "checkpoint":
      return parseCheckpoint(raw, maxTextLength, rawGuard.truncated);
    default:
      return {
        kind: "invalid",
        reason: `unknown response kind: ${JSON.stringify(kind)}`,
        errorKind: "invalid_response",
        truncated: rawGuard.truncated,
      };
  }
}

/** kind=answer：text 必须为非空字符串；artifacts 可选字符串数组。 */
function parseAnswer(
  raw: Record<string, unknown>,
  maxTextLength: number,
  rawTruncated: boolean
): ParsedAgentResponse {
  const text = (raw as { text?: unknown }).text;
  if (!isNonNullString(text)) {
    return {
      kind: "invalid",
      reason: "answer.text must be a non-empty string",
      errorKind: "invalid_response",
      truncated: rawTruncated,
    };
  }
  const t = truncate(text, maxTextLength);
  const artifacts = (raw as { artifacts?: unknown }).artifacts;
  if (artifacts !== undefined && !isStringArray(artifacts)) {
    return {
      kind: "invalid",
      reason: "answer.artifacts must be an array of strings",
      errorKind: "invalid_response",
      truncated: rawTruncated,
    };
  }
  return {
    kind: "answer",
    text: t.text,
    ...(Array.isArray(artifacts) ? { artifacts } : {}),
    truncated: t.truncated || rawTruncated,
  };
}

/** kind=tool_calls：calls 必须为非空数组，逐项结构校验（R-2）。 */
function parseToolCalls(
  raw: Record<string, unknown>,
  maxToolCalls: number,
  truncatedText: boolean
): ParsedAgentResponse {
  const calls = (raw as { calls?: unknown }).calls;
  if (!Array.isArray(calls)) {
    return {
      kind: "invalid",
      reason: "tool_calls.calls must be an array",
      errorKind: "invalid_response",
      truncated: truncatedText,
    };
  }
  if (calls.length === 0) {
    return {
      kind: "invalid",
      reason: "tool_calls.calls must not be empty",
      errorKind: "invalid_response",
      truncated: truncatedText,
    };
  }
  if (maxToolCalls > 0 && calls.length > maxToolCalls) {
    return {
      kind: "invalid",
      reason: `tool_calls exceeds limit of ${maxToolCalls}`,
      errorKind: "invalid_response",
      truncated: truncatedText,
    };
  }
  const parsedCalls: RawToolCall[] = [];
  for (let i = 0; i < calls.length; i++) {
    const call = toRawToolCall(calls[i]);
    if (call === null) {
      return {
        kind: "invalid",
        reason: `tool_calls[${i}] must have tool (non-empty string) and arguments (object)`,
        errorKind: "invalid_response",
        truncated: truncatedText,
      };
    }
    parsedCalls.push(call);
  }
  const note = (raw as { note?: unknown }).note;
  return {
    kind: "tool_calls",
    calls: parsedCalls,
    ...(isNonNullString(note) ? { note } : {}),
  };
}

/** kind=checkpoint：message 必须为非空字符串；options 可选字符串数组。 */
function parseCheckpoint(
  raw: Record<string, unknown>,
  maxTextLength: number,
  rawTruncated: boolean
): ParsedAgentResponse {
  const message = (raw as { message?: unknown }).message;
  if (!isNonNullString(message)) {
    return {
      kind: "invalid",
      reason: "checkpoint.message must be a non-empty string",
      errorKind: "invalid_response",
      truncated: rawTruncated,
    };
  }
  const m = truncate(message, maxTextLength);
  const options = (raw as { options?: unknown }).options;
  if (options !== undefined && !isStringArray(options)) {
    return {
      kind: "invalid",
      reason: "checkpoint.options must be an array of strings",
      errorKind: "invalid_response",
      truncated: rawTruncated,
    };
  }
  return {
    kind: "checkpoint",
    message: m.text,
    ...(Array.isArray(options) && options.length > 0 ? { options } : {}),
    truncated: m.truncated || rawTruncated,
  };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

// ---------------------------------------------------------------------------
// ResponseParser（面向对象包装；无状态，仅方法委托 parse）
// ---------------------------------------------------------------------------

/**
 * ResponseParser —— 无状态解析器。
 * 以类形式提供，便于依赖注入；内部无字段、无副作用。
 */
export class ResponseParser {
  parse(response: ModelResponse, options?: ResponseParseOptions): ParsedAgentResponse {
    return parse(response, options);
  }
}

/** 工厂：创建 ResponseParser。 */
export function createResponseParser(): ResponseParser {
  return new ResponseParser();
}