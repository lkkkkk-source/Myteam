/**
 * MyTeam OpenCode Plugin — Loader (loader.ts) — v1.0.1
 * ---------------------------------------------------------------------------
 * 负责读取 MyTeam 平台资产（source/ platform/ registry/ runtime/），
 * 【只读、就地读取，不复制文件到宿主】。
 *
 * 隔离原则：Loader 只从 MyTeam 仓库读取；绝不写入 ~/.config/opencode。
 * 本阶段为封装接口层：加载 = 解析引用（不真正启动执行引擎）。
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface MyTeamPaths {
  workspace: string;
  source: string;
  platform: string;
  registry: string;
  agentBinding: string;
  runtimeContext: string;
  adapterState: string;
}

export interface LoadedRegistry {
  agents: string[]; // platform_agent 名称列表（读取自 agent-binding.yaml）
  mcp: number;
  skill: number;
  workflow: number;
}

export interface LoadResult {
  ok: boolean;
  workspace: string;
  registry: LoadedRegistry;
  copiedFiles: number; // 恒为 0：Loader 不复制任何文件
  readOnly: true;
  errors: string[];
}

/** 解析 myteam-plugin.yaml 中声明的路径（相对 workspace）。 */
export function resolvePaths(workspace: string): MyTeamPaths {
  return {
    workspace,
    source: path.join(workspace, "source"),
    platform: path.join(workspace, "platform"),
    registry: path.join(workspace, "evolution", "version-registry.yaml"),
    agentBinding: path.join(workspace, "platform", "runtime-adapter", "agent-binding.yaml"),
    runtimeContext: path.join(workspace, ".ai", "context", "runtime", "runtime-context.yaml"),
    adapterState: path.join(workspace, ".ai", "context", "runtime-adapter", "adapter-state.yaml"),
  };
}

/** 极简 YAML 计数解析（只用于读取绑定 / 计数，不引入依赖，保持隔离）。 */
function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

/** 读取 agent-binding.yaml 中的 platform_agent 列表（只读）。 */
export function loadAgents(agentBindingPath: string): string[] {
  if (!fs.existsSync(agentBindingPath)) return [];
  const raw = fs.readFileSync(agentBindingPath, "utf8");
  const names: string[] = [];
  const re = /platform_agent:\s*"([a-z0-9-]+)"/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(raw)) !== null) names.push(mm[1]);
  return names;
}

/**
 * 加载 MyTeam 平台（只读聚合）。
 * 关键不变量：copiedFiles === 0（不复制），readOnly === true（就地读取）。
 */
export function loadPlatform(workspace: string): LoadResult {
  const paths = resolvePaths(workspace);
  const errors: string[] = [];

  if (!fs.existsSync(paths.source)) errors.push("source/ not found");
  if (!fs.existsSync(paths.platform)) errors.push("platform/ not found");

  const agents = loadAgents(paths.agentBinding);
  const mcpRaw = fs.existsSync(path.join(workspace, ".ai/context/capability/mcp-registry.yaml"))
    ? fs.readFileSync(path.join(workspace, ".ai/context/capability/mcp-registry.yaml"), "utf8")
    : "";
  const skillRaw = fs.existsSync(path.join(workspace, ".ai/context/capability/skill-registry.yaml"))
    ? fs.readFileSync(path.join(workspace, ".ai/context/capability/skill-registry.yaml"), "utf8")
    : "";

  const registry: LoadedRegistry = {
    agents,
    mcp: countMatches(mcpRaw, /- mcp:/g),
    skill: countMatches(skillRaw, /- skill:/g),
    workflow: fs.existsSync(path.join(workspace, "source/workflows"))
      ? fs.readdirSync(path.join(workspace, "source/workflows")).filter((f) => f.endsWith(".md")).length
      : 0,
  };

  return {
    ok: errors.length === 0,
    workspace,
    registry,
    copiedFiles: 0, // 隔离保证：不复制任何文件
    readOnly: true,
    errors,
  };
}
