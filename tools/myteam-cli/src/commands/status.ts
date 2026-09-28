/** myteam status — 显示 MyTeam 平台状态概览（只读）。 */
import { WORKSPACE, readCounts } from "../services/registry-service";
import { readPlugin } from "../services/plugin-service";
import { header } from "../output/formatter";

export function status(workspace = WORKSPACE): string {
  const c = readCounts(workspace);
  const p = readPlugin(workspace);
  return [
    header(`MyTeam ${p.platformVersion}`),
    `  Plugin:   ${p.loaded ? "✓ loaded" : "✗ not loaded"} (${p.name} ${p.version})`,
    `  Agents:   ${c.agents}/30`,
    `  Teams:    ${c.teams}`,
    `  MCP:      ${c.mcp}`,
    `  Skill:    ${c.skill}`,
    `  Workflow: ${c.workflow}`,
    `  Runtime:  ${c.agents === 30 ? "healthy" : "degraded"}`,
    `  Adapter:  read-only (source-of-truth=MyTeam)`,
    `  Evolution: version-registry active`,
    `  Lifecycle: ${p.lifecycleState}`,
  ].join("\n");
}
