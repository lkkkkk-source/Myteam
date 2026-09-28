/**
 * MyTeam OpenCode Plugin — Tool Bridge (index.ts) — v1.6.3
 * ---------------------------------------------------------------------------
 * Capability Binding Layer 模块出口：
 *   AgentRuntimeInstance → AgentExecutionContext
 * 只做能力绑定，不执行任何工具 / bash / OpenCode tool。
 * ---------------------------------------------------------------------------
 */

export * from "./context";
export * from "./permission-resolver";
export * from "./tool-resolver";
export * from "./mcp-resolver";
export * from "./security";
export * from "./tool-bridge";
