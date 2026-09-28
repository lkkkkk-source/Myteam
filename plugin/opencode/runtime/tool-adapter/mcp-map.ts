/**
 * MyTeam OpenCode Plugin — Tool Adapter · MCP Mapping (mcp-map.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * 设计 §4（MCP Mapping）。
 *
 * 把 ctx.mcp（McpCapability[]，Tool Bridge 产出的静态绑定）映射为宿主 MCP 调用：
 *
 *   工具全名 "mcp:<server>" → { server, method: <tool>, args }
 *
 * 规则：
 *   - 只读引用 ctx.mcp / McpRegistry 声明；不解析能力语义（provides 仅审计）。
 *   - 不启动 / 不管理 MCP 进程 —— 生命周期归宿主（本阶段 hostPort 是 mock）。
 *   - 未绑定（server 不在 ctx.mcp）→ 返回 mcp=false + reason（→ tool_error）。
 *
 * 禁则：
 *   - 不修改配置、不写 opencode.json、不新增 MCP、不触发任何 MCP 调用。
 * ---------------------------------------------------------------------------
 */

import type { ToolInvocationRequest, ToolInvocationResult } from "../runner/types";
import type { McpCapability } from "../tool-bridge/mcp-resolver";

/** 宿主 MCP 调用载荷（未来由真实宿主 MCP client 消费；本阶段仅形状）。 */
export interface McpInvocation {
  server: string;
  method: string;
  args: Record<string, unknown>;
}

/** MCP 映射结果。 */
export interface McpMapping {
  /** 是否成功解析出宿主调用载荷。 */
  mcp: boolean;
  /** 成功：宿主调用载荷；失败：undefined。 */
  invocation?: McpInvocation;
  /** 失败原因（mcp=false 时）。 */
  reason?: string;
}

/** 提取 MCP server 名（"mcp:context7:query" → "context7"）。 */
export function mcpServerOf(tool: string): string {
  const parts = tool.split(":");
  return parts.length >= 2 ? parts[1] : tool.startsWith("mcp:") ? tool.slice(4) : tool;
}

/** 提取 MCP 工具方法名（"mcp:context7:read_docs" → "read_docs"）。 */
export function mcpMethodOf(tool: string): string {
  const parts = tool.split(":");
  return parts.length >= 3 ? parts.slice(2).join(":") : "";
}

/**
 * §4 映射：校验 ctx.mcp 绑定 → 生成宿主调用载荷。
 * 不做任何网络 / 进程动作。
 */
export function mapMcpInvocation(
  req: ToolInvocationRequest,
  mcp: McpCapability[]
): McpMapping {
  const server = mcpServerOf(req.tool);
  const found: McpCapability | undefined = mcp.find((m) => m.mcp === server);
  if (!found) {
    return {
      mcp: false,
      reason: `mcp binding: server "${server}" not in ctx.mcp`,
    };
  }

  const method = mcpMethodOf(req.tool);
  if (!method) {
    return {
      mcp: false,
      reason: `mcp mapping: tool "${req.tool}" lacks method segment (expected "mcp:<server>:<method>")`,
    };
  }

  return {
    mcp: true,
    invocation: {
      server,
      method,
      args: { ...req.arguments },
    },
  };
}
