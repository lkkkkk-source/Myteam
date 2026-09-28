/**
 * MyTeam CLI — Registry Service (registry-service.ts) — v1.1
 * -------------------------------------------------------------------------
 * 读取平台注册表：agent-binding(30) / mcp / skill / team / version-registry。
 * 就地只读；不复制、不修改。
 */

import * as fs from "node:fs";
import * as path from "node:path";

export const WORKSPACE = "D:/data/code/Agent/MyTeam";

export interface RegistryCounts {
  agents: number;
  mcp: number;
  skill: number;
  workflow: number;
  teams: number;
}

/** 极简 YAML 顶层标量读取（key: "value" 或 key: value）。 */
export function readYamlScalars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^(\w[\w-]*):\s*"?([^"\n#]+?)"?\s*(?:#.*)?$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!(m[1] in out)) out[m[1]] = m[2].trim();
  }
  return out;
}

function count(file: string, re: RegExp): number {
  if (!fs.existsSync(file)) return 0;
  const t = fs.readFileSync(file, "utf8");
  const m = t.match(re);
  return m ? m.length : 0;
}

export function readCounts(workspace = WORKSPACE): RegistryCounts {
  const agentBinding = path.join(workspace, "platform/runtime-adapter/agent-binding.yaml");
  const mcpReg = path.join(workspace, ".ai/context/capability/mcp-registry.yaml");
  const skillReg = path.join(workspace, ".ai/context/capability/skill-registry.yaml");
  const teamReg = path.join(workspace, ".ai/context/team-registry.yaml");
  const wfDir = path.join(workspace, "source/workflows");

  return {
    agents: count(agentBinding, /platform_agent:/g),
    mcp: count(mcpReg, /- mcp:/g),
    skill: count(skillReg, /- skill:/g),
    workflow: fs.existsSync(wfDir) ? fs.readdirSync(wfDir).filter((f) => f.endsWith(".md")).length : 0,
    teams: count(teamReg, /^\s+- id:/gm),
  };
}

/** 读取 version-registry 中 agent->version 映射。 */
export function readAgentVersions(workspace = WORKSPACE): Record<string, string> {
  const file = path.join(workspace, "evolution/version-registry.yaml");
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  const t = fs.readFileSync(file, "utf8");
  const re = /- agent:\s*([a-z0-9-]+)\s*\r?\n\s*version:\s*(v\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) out[m[1]] = m[2];
  return out;
}
