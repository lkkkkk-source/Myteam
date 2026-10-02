/**
 * MyTeam OpenCode Plugin — Agent Executor (index.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 3 — AgentExecutor V2 模块出口。
 * ---------------------------------------------------------------------------
 */

export {
  AgentExecutorImpl,
  createAgentExecutor,
  type AgentExecutorDeps,
} from "./agent-executor";
export { AgentError, buildFailure, collapseError } from "./error-model";
