/**
 * MyTeam OpenCode Plugin — Tool Adapter Core (adapter.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * 设计 §2 / §3 / §5（ToolAdapter：Runner 的 ToolInvocationPort → 宿主工具的唯一通道）。
 *
 * 调用链（设计 §2.1）：
 *   Runner
 *     │  ToolInvocationRequest（已校验：allowed=true / 路径在安全域内）
 *     ▼
 *   ToolInvocationPort（v1.7.1 定义；本 Adapter 即其真实实现）
 *     │
 *     ▼
 *   ToolAdapter.invoke()   ← 本模块
 *     │  二次校验（§3 permission-check）
 *     │  + 安全域（§6 security）
 *     │  + MCP 映射（§4 mcp-map）
 *     │  + 宿主下发（本阶段 hostPort = mock，不接真实宿主工具）
 *     │  + 错误归一（§5 error-map）
 *     ▼
 *   宿主工具 / 宿主 MCP（本阶段由 HostPort mock 替代；不发起真实调用）
 *
 * 边界（§2.2）：
 *   - 单向：Adapter 是 Runner 下行工具能力的唯一通道。
 *   - 二次校验：纵深防御（消费 Tool Bridge 的 security + permissions）。
 *   - 不绕过 Tool Bridge：只读请求，不修改 AgentExecutionContext。
 *   - 不直接写宿主：自身不写 ~/.config/opencode；写由宿主执行，Adapter 拦截判断。
 *
 * 禁则：
 *   - 不执行真实宿主工具（hostPort 由调用方注入；本阶段 mock）。
 *   - 不启动 MCP（MCP 生命周期归宿主；本阶段 hostPort mock）。
 *   - 不修改 OpenCode 配置（不写 opencode.json）。
 *   - 不实现 Trace（trace_hint 仅为诊断标注，不是 Trace 事件）。
 * ---------------------------------------------------------------------------
 */

import type { ToolInvocationRequest, ToolInvocationResult, RunnerErrorKind } from "../runner/types";
import type { AgentExecutionContext } from "../tool-bridge/context";
import { checkPermission } from "./permission-check";
import { mapMcpInvocation } from "./mcp-map";
import { mapHostError, type HostError } from "./error-map";
import { checkSecurityDomain } from "./security";

/** 宿主工具调用端口（未来接真实 OpenCode 工具 / MCP；本阶段由调用方注入 mock）。 */
export interface HostToolPort {
  invoke(
    req: ToolInvocationRequest,
    opts: { mcp?: { server: string; method: string; args: Record<string, unknown> } }
  ): Promise<ToolInvocationResult>;
}

/** ToolAdapter 依赖。 */
export interface ToolAdapterDeps {
  /** 宿主工具端口（本阶段 mock；未来接真实宿主工具 / MCP client）。 */
  hostPort: HostToolPort;
  /** 可选：注入 now（测试可控时间）；默认 Date.now。 */
  now?: () => number;
}

/**
 * ToolAdapter.invoke() — Runner 的 ToolInvocationPort 真实实现。
 *
 * 流程（§2.1 + §3 + §4 + §5 + §6）：
 *   1. §3 二次校验（permission-check + security）→ 失败：assertion_error，不下发
 *   2. §4 MCP 映射（source=mcp 时生成宿主调用载荷）
 *   3. §6 宿主下发（经 hostPort mock；不接真实宿主工具）
 *   4. §5 错误归一（宿主失败 → mapHostError → RunnerErrorKind）
 *   5. 组装 ToolInvocationResult（与 v1.7.1 形状一致，Runner 无需改动）
 */
export async function adapterInvoke(
  req: ToolInvocationRequest,
  ctx: AgentExecutionContext,
  deps: ToolAdapterDeps
): Promise<ToolInvocationResult> {
  const started = deps.now ? deps.now() : Date.now();

  // 1. §3 二次校验
  const verdict = checkPermission(req, ctx);
  if (!verdict.ok) {
    const kind = verdict.kind ?? "assertion_error";
    return fail(started, deps, kind, `permission check denied: ${verdict.reason}`);
  }

  // §6 安全域（含 host-config 黑名单）
  const secErr = checkSecurityDomain(req);
  if (secErr !== null) {
    return fail(started, deps, "assertion_error", secErr);
  }

  // 2. §4 MCP 映射（source=mcp 时）
  let mcpOpts: { mcp?: { server: string; method: string; args: Record<string, unknown> } } = {};
  if (req.source === "mcp") {
    const m = mapMcpInvocation(req, ctx.mcp);
    if (!m.mcp) {
      return fail(started, deps, "tool_error", `mcp mapping failed: ${m.reason}`);
    }
    mcpOpts = { mcp: m.invocation };
  }

  // 3. §6 宿主下发（经 hostPort mock；不接真实宿主工具）
  let hostRes: ToolInvocationResult;
  try {
    hostRes = await deps.hostPort.invoke(req, mcpOpts);
  } catch (e) {
    // 宿主调用抛出异常 → 归一
    const hostErr: HostError = {
      message: e instanceof Error ? e.message : String(e),
    };
    return fail(started, deps, "agent_error", `host invoke threw: ${hostErr.message}`);
  }

  // 4. §5 错误归一（宿主返回 ok=false 时）
  if (hostRes.ok) {
    const done = deps.now ? deps.now() : Date.now();
    return { ...hostRes, duration: done - started };
  }

  // 宿主 ok=false → 映射为带 error_kind 的失败
  const mapped = mapHostError({
    message: hostRes.error ?? "host tool failed",
    code: hostRes.error_code,
  });
  const done = deps.now ? deps.now() : Date.now();
  return {
    ok: false,
    error: mapped.detail,
    error_kind: mapped.kind,
    duration: done - started,
  };
}

/** 构造失败结果（带 error_kind 标注）。 */
function fail(
  started: number,
  deps: ToolAdapterDeps,
  kind: RunnerErrorKind,
  detail: string
): ToolInvocationResult {
  const now = deps.now ? deps.now() : Date.now();
  return {
    ok: false,
    error: detail,
    error_kind: kind,
    duration: now - started,
  };
}

/**
 * ToolAdapter —— 实现 ToolInvocationPort 接口（Runner 可直接注入）。
 * 把 v1.7.1 的 mock 替换为真实二次校验 + 安全域 + MCP 映射 + 错误归一。
 * 宿主下发仍走 hostPort（本阶段 mock；未来接真实宿主工具）。
 */
export class ToolAdapter {
  private readonly ctx: AgentExecutionContext;
  private readonly deps: ToolAdapterDeps;

  constructor(ctx: AgentExecutionContext, deps: ToolAdapterDeps) {
    this.ctx = ctx;
    this.deps = deps;
  }

  /** ToolInvocationPort.invoke —— Runner 调用入口。 */
  async invoke(req: ToolInvocationRequest): Promise<ToolInvocationResult> {
    return adapterInvoke(req, this.ctx, this.deps);
  }
}
