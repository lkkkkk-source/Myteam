/**
 * MyTeam CLI — Validation Service (validation-service.ts) — v1.1
 * -------------------------------------------------------------------------
 * 发布前一致性校验：agent registry↔source↔version / mcp / skill / adapter / evolution。
 * 只报告，不修复。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { WORKSPACE, readCounts, readAgentVersions } from "./registry-service";

export interface Finding {
  area: string;
  level: "ok" | "warning" | "error";
  message: string;
}

const BASELINE = { agent: 30, mcp: 5, skill: 26, workflow: 8 };

export function validate(workspace = WORKSPACE): { findings: Finding[]; ok: boolean } {
  const findings: Finding[] = [];
  const counts = readCounts(workspace);

  // Agent: registry <-> source <-> version
  const ab = path.join(workspace, "platform/runtime-adapter/agent-binding.yaml");
  if (counts.agents === BASELINE.agent) findings.push({ area: "agent", level: "ok", message: `agent binding = ${counts.agents}` });
  else findings.push({ area: "agent", level: "error", message: `agent count ${counts.agents} != baseline ${BASELINE.agent}` });

  // source_prompt existence
  if (fs.existsSync(ab)) {
    const raw = fs.readFileSync(ab, "utf8");
    const srcs = [...raw.matchAll(/source_prompt:\s*"([^"]+)"/g)].map((m) => m[1]);
    const missing = srcs.filter((s) => !fs.existsSync(path.join(workspace, s)));
    if (missing.length === 0) findings.push({ area: "agent", level: "ok", message: "all source_prompt files exist" });
    else findings.push({ area: "agent", level: "error", message: `missing source: ${missing.join(", ")}` });

    // version alignment
    const vers = readAgentVersions(workspace);
    const bindVer = [...raw.matchAll(/platform_agent:\s*"([a-z0-9-]+)"[\s\S]*?version:\s*"(v\d+)"/g)];
    let mismatch = 0;
    for (const mm of bindVer) {
      const a = mm[1], v = mm[2];
      if (vers[a] && vers[a] !== v) mismatch++;
    }
    if (mismatch === 0) findings.push({ area: "agent", level: "ok", message: "version aligned (binding <-> registry)" });
    else findings.push({ area: "agent", level: "error", message: `${mismatch} agent version mismatch` });
  }

  // MCP
  findings.push(counts.mcp === BASELINE.mcp
    ? { area: "mcp", level: "ok", message: `mcp = ${counts.mcp}` }
    : { area: "mcp", level: "error", message: `mcp ${counts.mcp} != ${BASELINE.mcp}` });

  // Skill
  findings.push(counts.skill === BASELINE.skill
    ? { area: "skill", level: "ok", message: `skill = ${counts.skill}` }
    : { area: "skill", level: "error", message: `skill ${counts.skill} != ${BASELINE.skill}` });

  // Runtime adapter schema
  const schema = path.join(workspace, "platform/runtime-adapter/adapter-schema.yaml");
  findings.push(fs.existsSync(schema)
    ? { area: "runtime", level: "ok", message: "adapter-schema present" }
    : { area: "runtime", level: "error", message: "adapter-schema missing" });

  // Evolution version registry
  const vr = path.join(workspace, "evolution/version-registry.yaml");
  findings.push(fs.existsSync(vr)
    ? { area: "evolution", level: "ok", message: "version-registry present" }
    : { area: "evolution", level: "error", message: "version-registry missing" });

  const ok = findings.every((f) => f.level !== "error");
  return { findings, ok };
}
