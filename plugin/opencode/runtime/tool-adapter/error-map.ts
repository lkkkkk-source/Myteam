/**
 * MyTeam OpenCode Plugin — Tool Adapter · Error Mapping (error-map.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * 设计 §5（OpenCode error → RunnerError 归一）。
 *
 * 把宿主工具 / MCP 调用产生的错误，统一归一为 Runner 的 RunnerErrorKind：
 *
 *   | 宿主 / MCP 错误                  | RunnerErrorKind | 重试语义 |
 *   |---|---|---|
 *   | 工具未找到（宿主无此 tool）      | tool_error      | 可重试   |
 *   | 工具执行失败（IO 错 / 宿主拒绝） | tool_error      | 可重试   |
 *   | 宿主拒绝写（guardHostWrite 命中）| assertion_error | 不可重试 |
 *   | 路径越出安全域（二次校验命中）   | assertion_error | 不可重试 |
 *   | 参数校验失败（宿主 schema 拒绝） | tool_error      | 不可重试 |
 *   | 宿主超时                         | timeout         | 超时语义 |
 *   | 取消（宿主 / Runner cancel）     | cancel          | 取消语义 |
 *   | MCP server 不可达               | tool_error      | 可重试   |
 *   | 宿主异常（非标准）             | agent_error     | 兜底     |
 *
 * 本模块只做分类 + 标注；重试决策留在 Runner（v1.7.1 分层）。
 *
 * 禁则：
 *   - 不修改宿主、不写盘、不启动 MCP、不外泄裸异常。
 * ---------------------------------------------------------------------------
 */

import type { RunnerErrorKind } from "../runner/types";

/** 宿主 / 工具调用原始错误（来自 hostPort 返回或抛出的任意形态）。 */
export interface HostError {
  /** 宿主层错误码（可选，如 "ENOENT" / "EACCES" / "EHOSTUNREACH"）。 */
  code?: string;
  /** 宿主层错误信息（人类可读）。 */
  message: string;
  /** 宿主层是否超时。 */
  timeout?: boolean;
  /** 宿主层是否取消。 */
  cancelled?: boolean;
  /** 是否命中安全域拦截（guardHostWrite / 二次校验）。 */
  hostRejectWrite?: boolean;
}

/** 归一后的错误（对应 Runner meta.error）。 */
export interface MappedError {
  kind: RunnerErrorKind;
  /** 是否可重试（副作用类失败 / 安全域失败 → false）。 */
  retryable: boolean;
  /** 人类可读细节（写入 Runner meta.errorDetail）。 */
  detail: string;
}

/**
 * 把宿主原始错误归一为 RunnerErrorKind + 重试语义。
 * 分类表与设计 §5 一致。
 */
export function mapHostError(err: HostError): MappedError {
  // 取消信号优先（不可重试）
  if (err.cancelled) {
    return { kind: "cancel", retryable: false, detail: `cancelled: ${err.message}` };
  }

  // 超时（不可重试 / 超时语义）
  if (err.timeout) {
    return { kind: "timeout", retryable: false, detail: `timeout: ${err.message}` };
  }

  // 安全域拦截（guardHostWrite 命中 / 越域）→ assertion（不可重试）
  if (err.hostRejectWrite) {
    return {
      kind: "assertion_error",
      retryable: false,
      detail: `host rejected write (security domain): ${err.message}`,
    };
  }

  // MCP server 不可达 → tool_error（可重试）
  if (err.code === "EHOSTUNREACH" || err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    return {
      kind: "tool_error",
      retryable: true,
      detail: `mcp/host unreachable (${err.code}): ${err.message}`,
    };
  }

  // 参数 schema 拒绝（宿主）→ tool_error（不可重试：参数错重试无效）
  if (err.code === "EINVALID_ARG" || /schema|argument|param/i.test(err.message)) {
    return {
      kind: "tool_error",
      retryable: false,
      detail: `argument/schema rejected: ${err.message}`,
    };
  }

  // 工具未找到 / IO 错误 / 执行失败 → tool_error（可重试）
  if (
    err.code === "ENOENT" ||
    err.code === "EACCES" ||
    err.code === "EISDIR" ||
    err.code === "EEXIST"
  ) {
    return {
      kind: "tool_error",
      retryable: true,
      detail: `host tool failed (${err.code}): ${err.message}`,
    };
  }

  // 兜底：非标准宿主异常 → agent_error（宿主自身问题）
  return {
    kind: "agent_error",
    retryable: false,
    detail: `host unexpected: ${err.message}`,
  };
}
