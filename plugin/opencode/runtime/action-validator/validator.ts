/**
 * MyTeam OpenCode Plugin — Action Validator (validator.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 2 — Action Validation（动作校验 · 唯一放行闸门）。
 *
 * 核心命题（设计 §6.1 / 题干强制）：
 *   **模型输出不能直接执行。** ParsedAgentResponse.tool_calls 只是模型意图，
 *   必须逐项校验后才可经 ToolInvocationPort 下发。
 *
 * 校验项（设计 §6.2，执行层第一道闸门）：
 *   1. 工具已声明   → context.tools[].tool                      失败：invalid_response
 *   2. 来源一致     → decl.source 与请求一致（若模型声明了 source）失败：invalid_response
 *   3. 权限允许     → decl.allowed === true                    失败：tool_denied
 *   4. 安全域       → 路径类参数 ∈ allowed_paths ∉ deny_paths   失败：tool_denied
 *   5. 宿主黑名单   → 不命中 ~/.config/opencode 域             失败：tool_denied
 *   6. 参数形状     → arguments 为对象、tool 非空              失败：invalid_response
 *
 * Fail-Closed（设计 §9.3 SX-6）：任一调用校验失败 → 整批不产生 requests，
 * 仅返回 rejected 清单（不降级为直连/绕过）。
 *
 * 硬性禁则（本阶段强制）：
 *   - 不 import host-port / tool-adapter / node:fs / 网络 SDK（设计 §9.1 SX-3）。
 *   - 只读消费 context；不修改 tools[].allowed / permissions / security（设计 §9.3 SX-2）。
 *   - 纯计算；不调用工具、不写盘、不发起宿主/MCP。
 * ---------------------------------------------------------------------------
 */

import type { AgentExecutionContext } from "../tool-bridge/context";
import type { ParsedAgentResponse } from "../response-parser/types";
import type { ToolInvocationRequest } from "../runner/types";
import type {
  ActionValidationInput,
  ActionVerdict,
  RejectedToolCall,
  ValidatedActions,
} from "./types";

// ---------------------------------------------------------------------------
// 纯函数：安全域 / 宿主配置黑名单（语义对齐 tool-adapter/security.ts，本层自包含）
// ---------------------------------------------------------------------------

const FORBIDDEN_HOST_DOMAINS = [
  ".config/opencode/opencode.json",
  ".config/opencode/",
];

/** 路径是否命中宿主配置域（黑名单，最高优先）。 */
function isHostConfigTarget(targetPath: string): boolean {
  const norm = targetPath.replace(/\\/g, "/").toLowerCase();
  return FORBIDDEN_HOST_DOMAINS.some((f) => norm.includes(f));
}

/** 归一化路径（统一斜杠）。 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** 路径是否在 allowed 且不在 deny 域内（字符串域判断，不触碰 fs）。 */
function inSecurityDomain(
  p: string,
  allowed_paths: string[],
  deny_paths: string[]
): boolean {
  const n = normPath(p);
  const inAllowed = allowed_paths.some((ap) => {
    const a = normPath(ap);
    return n === a || n.startsWith(a + "/");
  });
  const inDeny = deny_paths.some((dp) => {
    const d = normPath(dp);
    return n === d || n.startsWith(d + "/");
  });
  return inAllowed && !inDeny;
}

/** 是否为路径类参数（key 命中 read/write/edit/path，value 为非空字符串）。 */
function isPathArg(key: string, value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && /(?:read|write|edit|path)/i.test(key);
}

// ---------------------------------------------------------------------------
// 单调用校验
// ---------------------------------------------------------------------------

/**
 * 校验单个 RawToolCall。
 * 全部通过 → ActionVerdict.ok=true + passed；否则 ok=false + error_kind + reason。
 */
function validateOneCall(
  call: import("../response-parser/types").RawToolCall,
  context: AgentExecutionContext
): ActionVerdict {
  const tool = call.tool;

  // 6. 参数形状：tool 非空、arguments 为对象（解析层已保证，此处纵深再查）。
  if (typeof tool !== "string" || tool.trim().length === 0) {
    return { tool, ok: false, error_kind: "invalid_response", reason: "tool name must be non-empty" };
  }
  if (typeof call.arguments !== "object" || call.arguments === null || Array.isArray(call.arguments)) {
    return { tool, ok: false, error_kind: "invalid_response", reason: "arguments must be an object" };
  }

  // 1. 工具已声明（context.tools 是唯一合法工具集）。
  const decl = context.tools.find((d) => d.tool === tool);
  if (!decl) {
    return { tool, ok: false, error_kind: "invalid_response", reason: `tool not declared: ${tool}` };
  }

  // 2. 来源一致：模型若声明了 source，必须与声明一致。
  if (call.source !== undefined && call.source !== decl.source) {
    return {
      tool,
      ok: false,
      error_kind: "invalid_response",
      reason: `source mismatch: requested=${call.source}, declared=${decl.source}`,
    };
  }

  // 3. 权限允许。
  if (decl.allowed !== true) {
    return {
      tool,
      ok: false,
      error_kind: "tool_denied",
      reason: `tool denied by permission model: ${tool} (allowed=false)`,
    };
  }

  // 4/5. 路径类参数：宿主配置黑名单（最高优先）→ 安全域检查。
  const sec = context.security;
  for (const [key, value] of Object.entries(call.arguments)) {
    if (!isPathArg(key, value)) continue;
    if (isHostConfigTarget(value)) {
      return {
        tool,
        ok: false,
        error_kind: "tool_denied",
        reason: `host config write blocked: ${key}=${value} (forbidden host domain)`,
      };
    }
    if (!inSecurityDomain(value, sec.allowed_paths, sec.deny_paths)) {
      return {
        tool,
        ok: false,
        error_kind: "tool_denied",
        reason: `path outside security domain: ${key}=${value}`,
      };
    }
  }

  return {
    tool,
    ok: true,
    passed: ["declared", "source_consistent", "allowed", "security_domain", "argument_shape"],
  };
}

// ---------------------------------------------------------------------------
// 核心校验入口
// ---------------------------------------------------------------------------

/**
 * validate —— 校验 ParsedAgentResponse，产出 ValidatedActions。
 *
 * - answer / checkpoint：无需工具动作，直接透传（不产生 requests）。
 * - invalid：透传解析失败原因。
 * - tool_calls：逐项校验；任一拒绝 → 整批 ok=false（Fail-Closed）。
 *
 * 纯函数：不调用工具、不写盘、不修改 context。
 */
export function validate(
  parsed: ParsedAgentResponse,
  context: AgentExecutionContext
): ValidatedActions {
  switch (parsed.kind) {
    case "answer":
      return {
        ok: true,
        kind: "answer",
        answer: { text: parsed.text, artifacts: parsed.artifacts },
        truncated: parsed.truncated,
      };

    case "checkpoint":
      return {
        ok: true,
        kind: "checkpoint",
        checkpoint: { message: parsed.message, options: parsed.options },
        truncated: parsed.truncated,
      };

    case "invalid":
      return {
        ok: false,
        kind: "invalid",
        error_kind: parsed.errorKind,
        reason: parsed.reason,
        truncated: parsed.truncated,
      };

    case "tool_calls": {
      const verdicts = parsed.calls.map((c) => validateOneCall(c, context));
      const rejected: RejectedToolCall[] = [];
      for (let i = 0; i < verdicts.length; i++) {
        const v = verdicts[i];
        if (!v.ok) {
          rejected.push({
            raw: parsed.calls[i],
            error_kind: v.error_kind ?? "invalid_response",
            reason: v.reason ?? `rejected: ${parsed.calls[i].tool}`,
          });
        }
      }

      // Fail-Closed：任一拒绝 → 整批不产生 requests。
      if (rejected.length > 0) {
        const error_kind: "tool_denied" | "invalid_response" = rejected.some(
          (r) => r.error_kind === "tool_denied"
        )
          ? "tool_denied"
          : "invalid_response";
        return {
          ok: false,
          kind: "tool_calls",
          error_kind,
          reason: `${rejected.length}/${parsed.calls.length} tool calls rejected (first: ${rejected[0].reason})`,
          rejected,
          verdicts,
          note: parsed.note,
        };
      }

      // 全部通过 → 组装 ToolInvocationRequest（直接可交回 toolPort）。
      const calls = parsed.calls.map((call, i) => {
        const decl = context.tools.find((d) => d.tool === call.tool)!;
        const source = call.source ?? decl.source;
        const request: ToolInvocationRequest = {
          tool: call.tool,
          source,
          arguments: call.arguments,
          allowed: true,
          security: {
            allowed_paths: [...context.security.allowed_paths],
            deny_paths: [...context.security.deny_paths],
            host_config: context.security.host_config,
          },
        };
        return {
          request,
          raw: call,
          passed: verdicts[i].passed ?? [],
        };
      });

      return {
        ok: true,
        kind: "tool_calls",
        requests: calls.map((c) => c.request),
        calls,
        verdicts,
        note: parsed.note,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// ActionValidator（面向对象包装；无状态，仅方法委托 validate）
// ---------------------------------------------------------------------------

/**
 * ActionValidator —— 无状态动作校验器。
 * 以类形式提供，便于依赖注入；内部无字段、无副作用。
 */
export class ActionValidator {
  validate(input: ActionValidationInput): ValidatedActions {
    return validate(input.parsed, input.context);
  }
}

/** 工厂：创建 ActionValidator。 */
export function createActionValidator(): ActionValidator {
  return new ActionValidator();
}