/**
 * MyTeam OpenCode Plugin — Tool Bridge Orchestrator (tool-bridge.ts) — v1.6.3
 * ---------------------------------------------------------------------------
 * Phase 3 — Tool Bridge · Capability Binding Layer。
 *
 * 核心公式：
 *   AgentRuntimeInstance (v1.6.1) + Resolution (v1.6.0)
 *      └─ Tool Bridge ─┐
 *                       ▼
 *             AgentExecutionContext（可执行能力上下文）
 *
 * 职责：
 *   1. 生成 AgentExecutionContext（permission / tools / mcp / skills / security）。
 *   2. 持久化到 <project_root>/.team/runtime/context/<agent>/agent-execution-context.yaml
 *      （项目运行状态域内；**绝不写 MyTeam Home / Host**）。
 *
 * 禁则（本阶段强制）：
 *   - 不调用任何工具 / 不调用 bash / 不调用 OpenCode tool。
 *   - 不实现 Runner / Execution State / Trace。
 *   - 不写 Home、不碰 opencode.json。
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Resolution } from "../../workspace-resolver";
import type { AgentRuntimeInstance } from "../../agent-instance";
import { permissionOf } from "./permission-resolver";
import { resolveCapabilities } from "./mcp-resolver";
import { resolveTools } from "./tool-resolver";
import { buildSecurity } from "./security";
import { renderContextYaml, type AgentExecutionContext } from "./context";

/** 规范路径：统一分隔符 + 去尾斜杠。 */
function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

/** 持久化目标：<team_root>/runtime/context/<agent>/agent-execution-context.yaml。 */
export function contextFilePath(res: Resolution, agent: string): string {
  return norm(path.join(res.team_root, "runtime", "context", agent, "agent-execution-context.yaml"));
}

/**
 * 核心：由 AgentRuntimeInstance + Resolution 构建 AgentExecutionContext。
 *   纯绑定（不写盘）；是否持久化由调用方决定。
 */
export function buildExecutionContext(
  inst: AgentRuntimeInstance,
  res: Resolution
): AgentExecutionContext {
  const permissions = permissionOf(inst);
  const caps = resolveCapabilities({ agent: inst.agent }, res);
  const mcp = caps.mcp;
  const tools = resolveTools(inst, permissions, mcp);
  const security = buildSecurity(res);
  const persistenceTarget = contextFilePath(res, inst.agent);

  return {
    schema_version: 1,
    layer: "tool-bridge-context",
    agent_instance: inst,
    workspace: norm(inst.workspace),
    tools,
    permissions,
    mcp,
    skills: caps.skills,
    security,
    persistence_target: persistenceTarget,
  };
}

/** 把 AgentExecutionContext 持久化到 .team（幂等；只写项目域）。 */
export function persistContext(ctx: AgentExecutionContext): string[] {
  const created: string[] = [];
  const target = ctx.persistence_target;
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    created.push(dir);
  }
  fs.writeFileSync(target, renderContextYaml(ctx), "utf8");
  created.push(target);
  return created;
}

/**
 * 一键：build + persist。
 * 返回 [context, 写入路径列表]。
 */
export function bindAndPersist(inst: AgentRuntimeInstance, res: Resolution): {
  context: AgentExecutionContext;
  written: string[];
} {
  const context = buildExecutionContext(inst, res);
  const written = persistContext(context);
  return { context, written };
}
