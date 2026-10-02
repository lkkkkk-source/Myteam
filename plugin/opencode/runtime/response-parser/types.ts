/**
 * MyTeam OpenCode Plugin — Response Parser · Types (types.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 2 — Response Parser（模型输出 → 结构化）· 类型模型。
 *
 * 核心命题（设计 §5）：
 *   **模型输出不可信。** 解析器只做「纯转换」：把 ModelResponse.text 还原为
 *   结构化 ParsedAgentResponse；**绝不**调用工具、**绝不**写盘、**绝不**判定
 *   工具合法性（合法性与权限留给 ActionValidator，设计 §6）。
 *
 * ParsedAgentResponse 是执行层的中间表示（untrusted）：
 *   - answer      → 终答
 *   - tool_calls  → 模型声明的工具调用意图（尚未校验）
 *   - checkpoint  → 请求人工确认
 *   - invalid     → 无法解析 / 结构非法 / 模型失败
 *
 * 禁则（本阶段强制）：
 *   - 不执行工具、不写盘、不联网、无副作用（纯内存转换）。
 *   - 不在此层判定 tool ∈ context.tools / allowed / 安全域（R-3）。
 * ---------------------------------------------------------------------------
 */

import type { AgentErrorKind } from "../model/types";

/** 模型声明的工具调用意图（不可信；校验后才可下发）。 */
export interface RawToolCall {
  /** 模型声明的工具名（必须为非空字符串；合法性由 ActionValidator 判定）。 */
  tool: string;
  /** 模型声明的参数（必须为对象；域校验由 ActionValidator 判定）。 */
  arguments: Record<string, unknown>;
  /**
   * 模型可选声明的来源（host/mcp）。
   * 缺省 = 由 ActionValidator 取声明来源；若声明则必须与声明一致。
   */
  source?: "host" | "mcp";
}

/** 终答动作。 */
export interface ParsedAnswer {
  kind: "answer";
  /** 答复文本（超长按上限截断）。 */
  text: string;
  /** 可选的产物声明（相对/绝对路径字符串；执行层只登记不落盘）。 */
  artifacts?: string[];
  /** 是否因安全上限被截断（R-5）。 */
  truncated?: boolean;
}

/** 工具调用动作（意图，未校验）。 */
export interface ParsedToolCalls {
  kind: "tool_calls";
  /** 模型声明的工具调用序列（发起时至少 1 项）。 */
  calls: RawToolCall[];
  /** 可选备注（人类可读；不参与校验）。 */
  note?: string;
}

/** 请求人工确认动作。 */
export interface ParsedCheckpoint {
  kind: "checkpoint";
  /** 请求人工确认的说明。 */
  message: string;
  /** 可选选项。 */
  options?: string[];
  /** 是否因安全上限被截断（R-5）。 */
  truncated?: boolean;
}

/** 无法解析 / 结构非法 / 模型失败。 */
export interface ParsedInvalid {
  kind: "invalid";
  /** 人类可读原因（不含凭据）。 */
  reason: string;
  /** 归一错误类别（设计 §8）。 */
  errorKind: AgentErrorKind;
  /** 是否因安全上限被截断（R-5）。 */
  truncated?: boolean;
}

/** Response Parser 的产物 —— 执行层中间表示（untrusted）。 */
export type ParsedAgentResponse =
  | ParsedAnswer
  | ParsedToolCalls
  | ParsedCheckpoint
  | ParsedInvalid;

/** 设计 §5 命名别名（ParsedAction）。 */
export type ParsedAction = ParsedAgentResponse;

/** 解析选项。 */
export interface ResponseParseOptions {
  /** 期望产物：'text' | 'json'（缺省 'json'；R-1 严格模式）。 */
  expects?: "text" | "json";
  /** 文本截断上限（字符；缺省 MAX_RESPONSE_TEXT_LENGTH）。 */
  maxTextLength?: number;
  /** 工具调用条数上限（缺省 MAX_TOOL_CALLS；超出 → invalid）。 */
  maxToolCalls?: number;
}

/** 默认文本截断上限（防 DoS；R-5）。 */
export const MAX_RESPONSE_TEXT_LENGTH = 100_000;

/** 原始响应硬上限（防 DoS；超限先截断再解析，JSON 残缺 → invalid）。 */
export const MAX_RESPONSE_RAW_LENGTH = 1_000_000;

/** 默认工具调用条数上限（防 DoS；超出 → invalid）。 */
export const MAX_TOOL_CALLS = 64;
