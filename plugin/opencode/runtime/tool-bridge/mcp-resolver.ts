/**
 * MyTeam OpenCode Plugin — Tool Bridge · MCP Resolver (mcp-resolver.ts) — v1.6.3
 * ---------------------------------------------------------------------------
 * Phase 3 — Tool Bridge · Capability Binding Layer。
 *
 * 链路（设计 §5）：
 *   AgentDefinition → mcp-registry → AgentRuntimeInstance → AgentExecutionContext
 *
 * 职责：**只引用** mcp-registry / skill-registry 既有声明，把“某 agent 可用的
 *   MCP 能力子集 + skill 列表”解析出来。**绝不修改配置、不新增 MCP、不装实体**。
 *
 * 读取目标（全部只读，位于 myteam_home）：
 *   <home>/.ai/context/capability/mcp-registry.yaml
 *   <home>/.ai/context/capability/skill-registry.yaml
 *
 * 禁则：
 *   - 不调用任何工具 / 不写盘（本模块纯解析）。
 *   - 不触碰 runtime_mcp 声明 / provider key / opencode.json。
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentDefinition } from "../../agent-loader";
import { loadAgentDefinitions, findAgentDefinition } from "../../agent-loader";

/** 一条 MCP 能力声明（来自 mcp-registry）。 */
export interface McpCapability {
  /** MCP 平台名（registry 中的 mcp 字段）。 */
  mcp: string;
  /** 提供的能力标签。 */
  provides: string[];
  /** 该 agent 实际可用的能力子集。 */
  capabilities: string[];
}

// ---------------------------------------------------------------------------
// 极简 YAML 列表解析（无外部依赖；针对 registry 文件的固定缩进风格）
// ---------------------------------------------------------------------------

function parseStringArray(raw: string): string[] {
  const out: string[] = [];
  for (const m of raw.matchAll(/"([^"]+)"/g)) out.push(m[1]);
  return out;
}

/**
 * 解析形如 “- mcp: "x" / provides: [...]” 的顶层条目块。
 * 返回 [{ mcp, provides, agents_using, capabilities }]。
 */
export function parseMcpRegistry(text: string): Array<{
  mcp: string;
  provides: string[];
  agents_using: string[];
  capabilities: string[];
}> {
  const out: Array<{
    mcp: string;
    provides: string[];
    agents_using: string[];
    capabilities: string[];
  }> = [];
  // 以 “  - mcp: ” 开头的行开始新条目，收集其后缩进为 4 空格的字段行
  const lines = text.split(/\r?\n/);
  let cur: {
    mcp: string;
    provides: string[];
    agents_using: string[];
    capabilities: string[];
  } | null = null;
  const fieldRe = /^ {4}(\w+):\s*(.*)$/;
  for (const line of lines) {
    const start = line.match(/^ {2}- mcp:\s*"([^"]+)"/);
    if (start) {
      if (cur) out.push(cur);
      cur = { mcp: start[1], provides: [], agents_using: [], capabilities: [] };
      continue;
    }
    if (cur) {
      const f = line.match(fieldRe);
      if (f) {
        const key = f[1];
        const val = f[2];
        const arr = parseStringArray(val);
        if (key === "provides") cur.provides = arr;
        else if (key === "agents_using") cur.agents_using = arr;
        else if (key === "capabilities") cur.capabilities = arr;
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 从 mcp-registry.yaml 读取全部 MCP 能力声明（只读）。 */
export function readMcpRegistry(registryPath: string): McpCapability[] {
  if (!fs.existsSync(registryPath)) return [];
  const text = fs.readFileSync(registryPath, "utf8");
  return parseMcpRegistry(text).map((e) => ({
    mcp: e.mcp,
    provides: e.provides,
    capabilities: e.capabilities,
  }));
}

/**
 * 解析某一 agent 可用 MCP：在 registry 中查 agents_using 包含该 agent 名的条目。
 * 只引用声明；**不创建 / 不修改任何 MCP 配置**。
 */
export function resolveMcpForAgent(
  registry: McpCapability[],
  agentName: string,
  agentsUsingMap: Map<string, string[]>
): McpCapability[] {
  const used = agentsUsingMap.get(agentName) ?? [];
  return registry
    .filter((m) => used.includes(m.mcp))
    .map((m) => ({ ...m }));
}

/** 读取 registry 并建立 “agent → [mcp]” 映射（供快速查询）。 */
export function buildAgentsUsingMap(
  entries: Array<{ mcp: string; agents_using: string[] }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of entries) {
    for (const a of e.agents_using) {
      const arr = map.get(a) ?? [];
      arr.push(e.mcp);
      map.set(a, arr);
    }
  }
  return map;
}

/**
 * 从 skill-registry.yaml 解析 skill 名列表（只读引用）。
 * 返回形如 [{ skill, provides, agents_using }]。
 */
export function parseSkillRegistry(text: string): Array<{
  skill: string;
  provides: string[];
  agents_using: string[];
}> {
  const out: Array<{ skill: string; provides: string[]; agents_using: string[] }> = [];
  const lines = text.split(/\r?\n/);
  let cur: { skill: string; provides: string[]; agents_using: string[] } | null = null;
  const fieldRe = /^ {4}(\w+):\s*(.*)$/;
  for (const line of lines) {
    const start = line.match(/^ {2}- skill:\s*"([^"]+)"/);
    if (start) {
      if (cur) out.push(cur);
      cur = { skill: start[1], provides: [], agents_using: [] };
      continue;
    }
    if (cur) {
      const f = line.match(fieldRe);
      if (f) {
        if (f[1] === "provides") cur.provides = parseStringArray(f[2]);
        else if (f[1] === "agents_using") cur.agents_using = parseStringArray(f[2]);
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * 解析某 agent 可用的 skill 列表：
 *   优先取 AgentDefinition.skills（prompt 已声明），
 *   缺省回退到 skill-registry 中 agents_using 命中该 agent 的 skill 名。
 */
export function resolveSkillsForAgent(
  def: AgentDefinition | undefined,
  registry: Array<{ skill: string; agents_using: string[] }>
): string[] {
  if (def && def.skills.length > 0) return [...def.skills];
  return registry.filter((s) => s.agents_using.includes(def?.name ?? "")).map((s) => s.skill);
}

/**
 * 顶层解析入口：给定 inst + Resolution，产出 mcp[] / skills[]。
 * 只读引用。返回 null 表示未找到对应 AgentDefinition（由上层决定回退）。
 */
export function resolveCapabilities(inst: {
  agent: string;
}, res: { myteam_home: string }): {
  def: AgentDefinition | undefined;
  mcp: McpCapability[];
  skills: string[];
} {
  const home = res.myteam_home;
  const capDir = path.join(home, ".ai", "context", "capability");
  const mcpRegPath = path.join(capDir, "mcp-registry.yaml");
  const rawReg = parseMcpRegistry(
    fs.existsSync(mcpRegPath) ? fs.readFileSync(mcpRegPath, "utf8") : ""
  );
  // 保留原始条目以构建 agents_using 映射；输出仍用 McpCapability（引用，不新增）
  const mcpReg: McpCapability[] = rawReg.map((e) => ({
    mcp: e.mcp,
    provides: e.provides,
    capabilities: e.capabilities,
  }));
  const skillReg = parseSkillRegistry(
    fs.existsSync(path.join(capDir, "skill-registry.yaml"))
      ? fs.readFileSync(path.join(capDir, "skill-registry.yaml"), "utf8")
      : ""
  );

  const defs = loadAgentDefinitions(path.join(home, "source", "prompts"));
  const def = findAgentDefinition(defs, inst.agent);
  const agentsUsing = buildAgentsUsingMap(rawReg);
  const mcp = resolveMcpForAgent(mcpReg, inst.agent, agentsUsing);
  const skills = resolveSkillsForAgent(def, skillReg);
  return { def, mcp, skills };
}
