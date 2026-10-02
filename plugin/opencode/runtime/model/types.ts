/**
 * MyTeam OpenCode Plugin — Model Adapter · Types (types.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 1 — Model Adapter Contract（模型适配器契约）。
 *
 * 本模块只定义「模型推理」的抽象边界；**不接入任何真实 LLM API**、
 * 不读取 API Key、不发起网络请求、不感知供应商专有字段。
 *
 * 设计依据：evolution/v1.8.4/reports/v1.8.4-agent-execution-design.md §4。
 *
 * 禁则（本阶段强制）：
 *   - 无真实 API Key（不读环境变量、不落盘凭据）。
 *   - 无网络出口（默认实现为 Null）。
 *   - 无供应商绑定（抽象层不出现任何厂商名/专属字段）。
 *   - 不触碰文件系统（除纯内存计算）。
 * ---------------------------------------------------------------------------
 */

import type { ExecutionPrompt } from "../prompt/types";

/**
 * 执行层错误分类（与设计 §8 AgentErrorKind 对齐）。
 * 归一为有限类别，供 AgentExecutor 折叠为 AgentExecutorResult.error。
 */
export type AgentErrorKind =
  /** 模型调用失败（网络 / 鉴权 / 供应商错误）。 */
  | "model_error"
  /** 超时。 */
  | "timeout"
  /** 模型输出不可解析 / 结构非法 / 工具未声明。 */
  | "invalid_response"
  /** prompt / 上下文超出模型窗口。 */
  | "context_overflow"
  /** 宿主 / 调度取消。 */
  | "cancel"
  /** 动作命中权限 / 安全域拒绝。 */
  | "tool_denied"
  /** 工具调用失败（透传 ToolInvocationResult.error_kind）。 */
  | "tool_error"
  /** 其余执行体内部错误。 */
  | "agent_error";

/** 归一后的完成原因。 */
export type ModelFinishReason =
  /** 正常结束。 */
  | "stop"
  /** 达到长度上限被截断。 */
  | "length"
  /** 模型请求调用工具。 */
  | "tool_use"
  /** 出错结束。 */
  | "error";

/**
 * 模型推理请求（适配器无关）。
 * 只承载 Prompt Assembly 的产物 + 可控参数；不含供应商专有内容。
 */
export interface ModelRequest {
  /** 由 Prompt Assembly 产出的执行 prompt（引用 Home，非副本）。 */
  prompt: ExecutionPrompt;
  /** 期望产物：'text' | 'json'（由 ResponseParser 决定解析策略）。 */
  expects: "text" | "json";
  /** 取消信号（透传宿主）。 */
  signal?: AbortSignal;
  /** 超时上限（毫秒；0 / 缺省 = 无）。 */
  timeout_ms?: number;
}

/** 归一后的模型用量（可选；不强制、不依赖）。 */
export interface ModelUsage {
  input_tokens?: number;
  output_tokens?: number;
}

/** 模型推理响应（适配器归一后）。 */
export interface ModelResponse {
  /** 是否成功。 */
  ok: boolean;
  /** 原始文本（text 或 JSON 字符串）。 */
  text: string;
  /** 供应商可辨识的用量（可选）。 */
  usage?: ModelUsage;
  /** 归一后的完成原因。 */
  finish_reason: ModelFinishReason;
  /** ok=false 时的错误分类（见 AgentErrorKind）。 */
  error_kind?: AgentErrorKind;
  /** ok=false 时的人类可读细节（不含凭据）。 */
  error_detail?: string;
}

/**
 * 模型适配器 —— 执行体唯一推理入口。
 * 真实适配器由上层显式注入；本阶段默认实现为 NullModelAdapter。
 */
export interface ModelAdapter {
  /** 唯一方法：给定请求，返回归一响应。 */
  complete(req: ModelRequest): Promise<ModelResponse>;
}
