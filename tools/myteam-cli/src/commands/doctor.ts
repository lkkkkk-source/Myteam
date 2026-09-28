/** myteam doctor — Runtime Diagnostics（只报告，不自动修复）。 */
import * as fs from "node:fs";
import * as path from "node:path";
import { WORKSPACE, readCounts } from "../services/registry-service";
import { readPlugin } from "../services/plugin-service";
import { header } from "../output/formatter";

type Level = "healthy" | "warning" | "error";
const MARK: Record<Level, string> = { healthy: "✓", warning: "!", error: "✗" };

export function doctor(workspace = WORKSPACE): string {
  const rows: Array<[string, Level, string]> = [];
  const p = readPlugin(workspace);
  const c = readCounts(workspace);

  // Plugin
  rows.push(["plugin.manifest", p.loaded ? "healthy" : "error", p.loaded ? "manifest valid" : "manifest missing"]);

  // Source
  rows.push(["source.exists", fs.existsSync(path.join(workspace, "source")) ? "healthy" : "error", "source/ presence"]);
  const ab = path.join(workspace, "platform/runtime-adapter/agent-binding.yaml");
  rows.push(["source.hash", fs.existsSync(ab) ? "healthy" : "warning", "agent-binding checksum present"]);

  // Registry
  rows.push(["registry.agent", c.agents === 30 ? "healthy" : "error", `agents=${c.agents}`]);
  rows.push(["registry.team", c.teams >= 6 ? "healthy" : "warning", `teams=${c.teams}`]);
  rows.push(["registry.capability", (c.mcp === 5 && c.skill === 26) ? "healthy" : "warning", `mcp=${c.mcp} skill=${c.skill}`]);

  // Runtime
  const adapterState = path.join(workspace, ".ai/context/runtime-adapter/adapter-state.yaml");
  const syncState = path.join(workspace, "platform/runtime-adapter/sync-state.yaml");
  rows.push(["runtime.adapter", fs.existsSync(adapterState) ? "healthy" : "warning", "adapter-state present"]);
  // drift detection (report only)
  let drift: Level = "healthy";
  let driftMsg = "no drift";
  if (fs.existsSync(syncState)) {
    const s = fs.readFileSync(syncState, "utf8");
    if (/drift_detected:\s*true/.test(s)) { drift = "warning"; driftMsg = "drift detected (report only, no auto-repair)"; }
  }
  rows.push(["runtime.sync", drift, driftMsg]);

  // OpenCode
  rows.push(["opencode.loading", p.loaded ? "healthy" : "warning", "plugin loadable"]);
  rows.push(["opencode.isolation", (p.copyFiles === false) ? "healthy" : "error", p.copyFiles === false ? "copy_files=false (isolated)" : "copy_files not false (risk)"]);

  const lines = rows.map(([k, lvl, msg]) => `  ${MARK[lvl]} ${k}: ${msg}`);
  const worst: Level = rows.some(r => r[1] === "error") ? "error" : rows.some(r => r[1] === "warning") ? "warning" : "healthy";
  return `${header("myteam doctor")}\n${lines.join("\n")}\n\noverall: ${worst}\n(note: diagnostics only — never auto-repairs)`;
}
