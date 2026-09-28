/**
 * MyTeam OpenCode Plugin — Tool Adapter · Permission Check (permission-check.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * 设计 §3（Permission Enforcement 二次验证）。
 *
 * Adapter 在把请求下发给宿主工具之前，再次确认 4 项（纵深防御）：
 *   1. agent permission  — 工具动作类型 vs ctx.permissions.read/edit/execute
 *   2. tool capability   — ctx.tools 中该 tool 已声明且 allowed=true
 *   3. security domain   — 路径类参数 ∈ allowed_paths 且 ∉ deny_paths
 *   4. mcp binding       — source=mcp 时 ctx.mcp 中存在匹配项
 *
 * 任一失败 → PermissionVerdict.denied + reason（→ 映射 assertion_error，不下发）。
 * 全部通过 → PermissionVerdict.ok。
 *
 * 禁则：
 *   - 纯计算，不读盘 / 不启动 MCP / 不修改 ctx / 不绕过 Tool Bridge。
 *   - 不修改 AgentExecutionContext；只读它的字段做断言。
 * ---------------------------------------------------------------------------
 */

import type { ToolInvocationRequest } from "../runner/types";
import type { AgentExecutionContext, ToolDeclaration } from "../tool-bridge/context";
import type { AgentPermission } from "../tool-bridge/permission-resolver";
import type { McpCapability } from "../tool-bridge/mcp-resolver";

/** 工具动作类型分类：决定需要哪个 agent permission。 */
type ToolAction = "read" | "edit" | "execute";

/** 把宿主工具名映射到所需 action 类型。 */
function toolActionOf(tool: string): ToolAction {
  const t = tool.toLowerCase();
  // read 类
  if (t === "read" || t === "glob" || t === "grep" || t === "find" || t.startsWith("mcp:")) {
    // mcp 工具的动作类型由 mcp-map 进一步解析；此处先按 read 兜底
    return "read";
  }
  // edit 类（写文件）
  if (t === "write" || t === "edit" || t === "create" || t === "patch") return "edit";
  // execute 类（执行命令 / 副作用）
  if (t === "bash" || t === "execute" || t === "shell" || t === "run") return "execute";
  // 未知工具：最小权限原则 → execute（最严格）
  return "execute";
}

/** 检查 agent 权限是否覆盖该工具动作。 */
function permissionCovers(action: ToolAction, perm: AgentPermission): boolean {
  switch (action) {
    case "read":
      return perm.read;
    case "edit":
      return perm.edit;
    case "execute":
      return perm.execute;
  }
}

/** 路径类参数名（小写关键字匹配；与 Runner 的 invokeTool 校验口径一致）。 */
function isPathArg(key: string, value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return /(?:read|write|edit|path)/i.test(key);
}

function pathInDomain(p: string, domain: string): boolean {
  const a = p.replace(/\\/g, "/");
  const b = domain.replace(/\\/g, "/");
  return a === b || a.startsWith(b + "/");
}

/**
 * 二次校验结果。
 * - ok=true：全部通过，允许下发。
 * - ok=false + kind + reason：失败项（→ kind 对应的 RunnerErrorKind 分类）。
 */
export interface PermissionVerdict {
  ok: boolean;
  /** 失败映射的 RunnerErrorKind（ok=false 时）：
   *  capability/permission/security 拒绝 → assertion_error（不可重试）；
   *  mcp binding 缺失 → tool_error（可重试）。 */
  kind?: import("../runner/types").RunnerErrorKind;
  /** 失败原因（ok=false 时；人类可读，含失败项）。 */
  reason?: string;
  /** 通过项清单（ok=true 时，审计用）。 */
  passed?: string[];
}

/**
 * §3 四项二次验证。
 * 输入：请求（已含 allowed + security）+ 完整 AgentExecutionContext（含 permissions/mcp/tools）。
 * 不修改任何字段；纯断言。
 */
export function checkPermission(
  req: ToolInvocationRequest,
  ctx: AgentExecutionContext
): PermissionVerdict {
  const passed: string[] = [];

  // 1. tool capability：ctx.tools 中该 tool 必须已声明且 allowed=true
  const decl: ToolDeclaration | undefined = ctx.tools.find(
    (d) => d.tool === req.tool && d.source === req.source
  );
  if (!decl) {
    return {
      ok: false,
      kind: "assertion_error",
      reason: `tool capability: "${req.tool}" (source=${req.source}) not declared in ctx.tools`,
    };
  }
  if (!decl.allowed || !req.allowed) {
    return {
      ok: false,
      kind: "assertion_error",
      reason: `tool capability: "${req.tool}" not allowed (decl.allowed=${decl.allowed})`,
    };
  }
  passed.push(`tool capability: ${req.tool} allowed`);

  // 2. agent permission：action 类型 vs permissions
  const action = toolActionOf(req.tool);
  if (!permissionCovers(action, ctx.permissions)) {
    return {
      ok: false,
      kind: "assertion_error",
      reason: `agent permission: action=${action} not covered by permissions (${permDesc(ctx.permissions)})`,
    };
  }
  passed.push(`agent permission: ${action} covered`);

  // 3. security domain：路径类参数 ∈ allowed_paths 且 ∉ deny_paths
  for (const [k, v] of Object.entries(req.arguments)) {
    if (isPathArg(k, v)) {
      const p = String(v);
      const allowed = req.security.allowed_paths.some((ap) => pathInDomain(p, ap));
      const denied = req.security.deny_paths.some((dp) => pathInDomain(p, dp));
      if (!allowed || denied) {
        return {
          ok: false,
          kind: "assertion_error",
          reason: `security domain: path "${k}=${p}" not in allowed_paths or inside deny_paths`,
        };
      }
    }
  }
  passed.push("security domain: paths in allowed / not in deny");

  // 4. mcp binding：source=mcp 时 ctx.mcp 必须含匹配项
  if (req.source === "mcp") {
    // MCP 工具名形如 "mcp:<server>"；server = req.tool 去掉 "mcp:" 前缀
    const server = mcpServerOf(req.tool);
    const mcpFound: McpCapability | undefined = ctx.mcp.find((m) => m.mcp === server);
    if (!mcpFound) {
      return {
        ok: false,
        kind: "tool_error",
        reason: `mcp binding: server "${server}" not found in ctx.mcp`,
      };
    }
    passed.push(`mcp binding: ${server} bound (${mcpFound.provides.join(", ") || "no provides"})`);
  } else {
    passed.push("mcp binding: n/a (host tool)");
  }

  return { ok: true, passed };
}

/** 从 MCP 工具名提取 server 名（"mcp:context7:query" → "context7"；非 mcp 前缀原样返回）。 */
export function mcpServerOf(tool: string): string {
  const parts = tool.split(":");
  return parts.length >= 2 ? parts[1] : tool.startsWith("mcp:") ? tool.slice(4) : tool;
}

/** 权限描述（审计可读）。 */
function permDesc(p: AgentPermission): string {
  return `read=${p.read} edit=${p.edit} execute=${p.execute}`;
}

/** 工具动作到 permission 的映射表（导出供测试断言）。 */
export const TOOL_ACTION_MAP: Record<string, ToolAction> = {
  read: "read",
  glob: "read",
  grep: "read",
  find: "read",
  write: "edit",
  edit: "edit",
  create: "edit",
  patch: "edit",
  bash: "execute",
  execute: "execute",
  shell: "execute",
  run: "execute",
};
