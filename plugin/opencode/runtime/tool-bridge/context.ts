/**
 * MyTeam OpenCode Plugin — Tool Bridge · Context Model (context.ts) — v1.6.3
 * ---------------------------------------------------------------------------
 * Phase 3 — Tool Bridge · Capability Binding Layer (只绑定 / 不执行)。
 *
 * 数据模型：AgentExecutionContext
 *   由 AgentRuntimeInstance (v1.6.1) + Resolution (v1.6.0) 投影而来。
 *   它回答：“这个 Agent 在这个项目里，能声明出哪些能力”。
 *
 * 字段（设计 §1）：
 *   agent_instance / workspace / tools[] / permissions / mcp[] / skills[] / security
 *
 * 本模块只做模型定义 + YAML 渲染 + 解析。**没有任何能力被调用**。
 * 执行 / bash / OpenCode tool 调用 / Runner / Execution State / Trace 一律不做。
 *
 * 隔离契约（沿用 v1.0.1）：
 *   - 只读 myteam_home 的 registry（引用，不写）。
 *   - 所有产出只落到 <project>/.team/** 与 project_root，绝不写 Home / Host。
 * ---------------------------------------------------------------------------
 */

import type { AgentRuntimeInstance } from "../../agent-instance";
import type { AgentPermission } from "../permission-resolver";
import type { McpCapability } from "../mcp-resolver";

/** 一条工具声明：工具名 + 是否被权限允许（仅声明，不触发）。 */
export interface ToolDeclaration {
  /** 工具标识（OpenCode Host 工具 / MCP 工具）。 */
  tool: string;
  /** 该 agent 是否被允许使用（由 permission-resolver 决定，非执行结果）。 */
  allowed: boolean;
  /** 工具来源：host（内置）或 mcp。 */
  source: "host" | "mcp";
  /** 允许理由（静态说明，便于审计）；不允许时给拒绝理由。 */
  reason: string;
}

/** 安全上下文：允许 / 拒绝 的路径域（供未来执行层拦截，本阶段只生成）。 */
export interface SecurityContext {
  /** 允许的写/读域：project_root + team_root（按顺序、无重复、已规范化）。 */
  allowed_paths: string[];
  /** 拒绝域：myteam_home + host config（一律只读 / 禁写）。 */
  deny_paths: string[];
  /** 宿主配置绝对路径（~/.config/opencode 规范化）。 */
  host_config: string;
  /** MyTeam Home 绝对路径（Source of Truth，禁写）。 */
  myteam_home: string;
}

/** Agent 可执行能力上下文 —— Tool Bridge 的核心产物。 */
export interface AgentExecutionContext {
  /** schema 版本（YAML 头）。 */
  schema_version: 1;
  /** 投影层标识。 */
  layer: "tool-bridge-context";
  /** 该实例对应的 AgentRuntimeInstance（原样携带，不改动字段）。 */
  agent_instance: AgentRuntimeInstance;
  /** 工具默认工作目录（= AgentRuntimeInstance.workspace）。 */
  workspace: string;
  /** 工具声明集合（host + mcp；仅能力声明，不触发调用）。 */
  tools: ToolDeclaration[];
  /** agent 级能力权限模型（read/edit/execute；由 permission-resolver 生成，不做执行检查）。 */
  permissions: AgentPermission;
  /** 绑定的 MCP 能力（引用 registry，不修改配置）。 */
  mcp: McpCapability[];
  /** 该 agent 的 skill 列表（引用 AgentDefinition.skills；不复制 skill 实体）。 */
  skills: string[];
  /** 安全域。 */
  security: SecurityContext;
  /** 持久化目标（供上层落盘，本模型自身不写盘）。 */
  persistence_target: string;
}

// ---------------------------------------------------------------------------
// YAML 渲染（极简、无外部依赖；与 agent-instance.ts 同一风格）
// ---------------------------------------------------------------------------

function q(s: string): string {
  return JSON.stringify(s);
}

/** 渲染 AgentExecutionContext → YAML 文本（供持久化到 <project>/.team/runtime/context/）。 */
export function renderContextYaml(ctx: AgentExecutionContext): string {
  const inst = ctx.agent_instance;
  const lines: string[] = [];
  lines.push(`schema_version: ${ctx.schema_version}`);
  lines.push(`layer: ${q(ctx.layer)}`);
  lines.push(`workspace: ${q(ctx.workspace)}`);
  lines.push(`persistence_target: ${q(ctx.persistence_target)}`);
  lines.push("agent_instance:");
  lines.push(`  id: ${q(inst.id)}`);
  lines.push(`  agent: ${q(inst.agent)}`);
  lines.push(`  role: ${q(inst.role)}`);
  lines.push(`  prompt_source: ${q(inst.prompt_source)}`);
  lines.push(`  memory_namespace: ${q(inst.memory_namespace)}`);
  lines.push(`  execution_id: ${q(inst.execution_id)}`);
  lines.push(`  status: ${q(inst.status)}`);
  lines.push(`  instance_dir: ${q(inst.instance_dir)}`);
  lines.push("  permissions:");
  if (inst.permissions.length === 0) lines.push(`    []`);
  else for (const p of inst.permissions) lines.push(`    - ${q(p)}`);

  lines.push("tools:");
  if (ctx.tools.length === 0) {
    lines.push(`  []`);
  } else {
    for (const t of ctx.tools) {
      lines.push(`  - tool: ${q(t.tool)} | source: ${t.source} | allowed: ${t.allowed} | reason: ${q(t.reason)}`);
    }
  }

  lines.push("permissions:");
  lines.push(`  read: ${ctx.permissions.read}`);
  lines.push(`  edit: ${ctx.permissions.edit}`);
  lines.push(`  execute: ${ctx.permissions.execute}`);

  lines.push("mcp:");
  if (ctx.mcp.length === 0) {
    lines.push(`  []`);
  } else {
    for (const m of ctx.mcp) {
      lines.push(`  - mcp: ${q(m.mcp)} | capabilities: [${m.capabilities.map(q).join(", ")}] | provides: [${m.provides.map(q).join(", ")}]`);
    }
  }

  lines.push("skills:");
  if (ctx.skills.length === 0) lines.push(`  []`);
  else for (const s of ctx.skills) lines.push(`  - ${q(s)}`);

  lines.push("security:");
  lines.push(`  host_config: ${q(ctx.security.host_config)}`);
  lines.push(`  myteam_home: ${q(ctx.security.myteam_home)}`);
  lines.push(`  allowed_paths:`);
  for (const p of ctx.security.allowed_paths) lines.push(`    - ${q(p)}`);
  lines.push(`  deny_paths:`);
  for (const p of ctx.security.deny_paths) lines.push(`    - ${q(p)}`);

  return lines.join("\n") + "\n";
}
