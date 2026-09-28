/**
 * MyTeam OpenCode Plugin — Tool Bridge · Tool Resolver (tool-resolver.ts) — v1.6.3
 * ---------------------------------------------------------------------------
 * Phase 3 — Tool Bridge · Capability Binding Layer。
 *
 * 职责：把 Permission 模型 + 已绑定 MCP 能力 → 工具声明集合（tools[]）。
 *   只生成“可用能力清单”，**不调用 / 不触发任何工具**。
 *
 * 工具来源：
 *   - host : OpenCode 内置工具（read/grep/glob，edit/write，bash/execute 等）。
 *   - mcp  : 该 agent 已绑定 MCP 的工具命名空间（引用，不执行）。
 *
 * 禁止：不执行 / 不写盘 / Unsupported 一律不落地。
 * ---------------------------------------------------------------------------
 */

import type { AgentRuntimeInstance } from "../../agent-instance";
import type { AgentPermission } from "../permission-resolver";
import type { McpCapability } from "../mcp-resolver";
import type { ToolDeclaration } from "./context";

/** 由权限生成 host 工具声明（风格：只声明，不触发调用）。 */
export function hostTools(perm: AgentPermission): ToolDeclaration[] {
  const out: ToolDeclaration[] = [];
  out.push({
    tool: "read",
    source: "host",
    allowed: perm.read,
    reason: perm.read ? "read permission granted" : "read permission denied",
  });
  out.push({
    tool: "grep",
    source: "host",
    allowed: perm.read,
    reason: perm.read ? "read permission granted" : "read permission denied",
  });
  out.push({
    tool: "glob",
    source: "host",
    allowed: perm.read,
    reason: perm.read ? "read permission granted" : "read permission denied",
  });
  out.push({
    tool: "edit",
    source: "host",
    allowed: perm.edit,
    reason: perm.edit ? "edit permission granted" : "edit permission denied",
  });
  out.push({
    tool: "write",
    source: "host",
    allowed: perm.edit,
    reason: perm.edit ? "edit permission granted" : "edit permission denied",
  });
  out.push({
    tool: "bash",
    source: "host",
    allowed: perm.execute,
    reason: perm.execute ? "execute permission granted" : "execute permission denied",
  });
  return out;
}

/**
 * 由已绑定 MCP 能力生成 mcp 工具声明（引用，不执行）。
 * MCP 工具是否“允许”由 execute/read 能力决定（副作用类需 execute）。
 */
export function mcpTools(mcpList: McpCapability[]): ToolDeclaration[] {
  // 只读类 MCP 工具（查询文档/推理）视为 read；执行类是 execute 的一部分。
  // 此处只做静态归类，是否真正允许由 hostTools + 上层 OK。
  return mcpList.map((m) => ({
    tool: `mcp:${m.mcp}`,
    source: "mcp" as const,
    allowed: true, // 声明；最终允许由执行层的 read/execute 判定（本阶段不执行）
    reason: `bound from mcp-registry (provides=${m.provides.join(",") || "-"})`,
  }));
}

/** 顶层解析：AgentRuntimeInstance + 权限模型 + MCP 列表 → 完整工具声明集合。 */
export function resolveTools(
  _inst: AgentRuntimeInstance,
  perm: AgentPermission,
  mcpList: McpCapability[]
): ToolDeclaration[] {
  return [...hostTools(perm), ...mcpTools(mcpList)];
}
