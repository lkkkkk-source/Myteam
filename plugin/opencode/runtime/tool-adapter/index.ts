/**
 * MyTeam OpenCode Plugin — Tool Adapter (index.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * Tool Adapter Core 出口。
 *
 * 模块：
 *   - adapter.ts          ToolAdapter / adapterInvoke + HostToolPort（Runner 的 ToolInvocationPort 实现）
 *   - permission-check.ts §3 二次验证（agent permission / tool capability / security domain / mcp binding）
 *   - mcp-map.ts          §4 MCP 映射（mcp:<server>:<method> → { server, method, args }）
 *   - error-map.ts        §5 宿主错误 → RunnerErrorKind 归一
 *   - security.ts         §6 安全域 / 宿主配置黑名单
 *
 * 约束：
 *   - 不接真实宿主工具（hostPort 由调用方注入 mock）。
 *   - 不启动 MCP（生命周期归宿主）。
 *   - 不修改 OpenCode 配置（不写 opencode.json）。
 *   - 不绕过 Tool Bridge（只读 AgentExecutionContext）。
 *   - 不实现 Trace（trace_hint 仅为诊断标注）。
 * ---------------------------------------------------------------------------
 */

export {
  ToolAdapter,
  adapterInvoke,
  type HostToolPort,
  type ToolAdapterDeps,
} from "./adapter";
export {
  checkPermission,
  mcpServerOf as permissionMcpServerOf,
  TOOL_ACTION_MAP,
  type PermissionVerdict,
} from "./permission-check";
export {
  mapMcpInvocation,
  mcpServerOf,
  mcpMethodOf,
  type McpInvocation,
  type McpMapping,
} from "./mcp-map";
export {
  mapHostError,
  type HostError,
  type MappedError,
} from "./error-map";
export {
  isHostConfigWrite,
  pathInSecurityDomain,
  checkSecurityDomain,
} from "./security";
export {
  OpenCodeHostPort,
  createOpenCodeHostPort,
  type OpenCodeClientSubset,
  type OpenCodeFileClient,
  type OpenCodeFindClient,
  type OpenCodePathClient,
  type OpenCodeMcpClient,
} from "./host-port/host-port";
