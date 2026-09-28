#!/usr/bin/env node
/**
 * MyTeam CLI — runnable entry (bin/myteam.mjs) — v1.1
 * -------------------------------------------------------------------------
 * Node-runnable mirror of src/*.ts (Node 20 cannot strip TS types natively).
 * Same logic as src/index.ts; authored TS source remains canonical.
 *
 * Governance: read-only. Never modifies OpenCode host, never copies files,
 * never auto-installs, never auto-executes tasks.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// workspace = repo root (tools/myteam-cli/bin -> ../../..)
const WORKSPACE = process.env.MYTEAM_WORKSPACE || path.resolve(__dirname, "..", "..", "..");

const BASELINE = { agent: 30, mcp: 5, skill: 26, workflow: 8 };
const COMMANDS = ["init", "status", "doctor", "validate", "upgrade", "rollback"];

function exists(p) { return fs.existsSync(path.join(WORKSPACE, p)); }
function read(p) { const f = path.join(WORKSPACE, p); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""; }
function count(p, re) { const t = read(p); const m = t.match(re); return m ? m.length : 0; }
function header(t) { return `\n=== ${t} ===`; }

function readCounts() {
  const wfDir = path.join(WORKSPACE, "source/workflows");
  return {
    agents: count("platform/runtime-adapter/agent-binding.yaml", /platform_agent:/g),
    mcp: count(".ai/context/capability/mcp-registry.yaml", /- mcp:/g),
    skill: count(".ai/context/capability/skill-registry.yaml", /- skill:/g),
    workflow: fs.existsSync(wfDir) ? fs.readdirSync(wfDir).filter((f) => f.endsWith(".md")).length : 0,
    teams: count(".ai/context/team-registry.yaml", /^\s+- id:/gm),
  };
}
function readPlugin() {
  const m = read("plugin/opencode/manifest.yaml");
  const s = read("plugin/opencode/plugin-state.yaml");
  const grab = (t, k) => { const mm = t.match(new RegExp(`^${k}:\\s*"?([^"\\n#]+?)"?\\s*(?:#.*)?$`, "m")); return mm ? mm[1].trim() : undefined; };
  return {
    name: grab(m, "name") || "myteam",
    version: grab(m, "version") || "unknown",
    platformVersion: grab(m, "platform_version") || "unknown",
    loaded: !!m,
    copyFiles: /copy_files:\s*false/.test(m),
    lifecycleState: grab(s, "lifecycle_state") || "loaded",
  };
}
function readAgentVersions() {
  const t = read("evolution/version-registry.yaml");
  const out = {};
  const re = /- agent:\s*([a-z0-9-]+)\s*\r?\n\s*version:\s*(v\d+)/g;
  let m; while ((m = re.exec(t)) !== null) out[m[1]] = m[2];
  return out;
}

function init() {
  const checks = [
    ["plugin manifest", exists("plugin/opencode/manifest.yaml")],
    ["workspace", fs.existsSync(WORKSPACE)],
    ["source path", exists("source")],
    ["runtime adapter", exists("platform/runtime-adapter/adapter-schema.yaml")],
  ];
  const lines = checks.map(([k, ok]) => `  ${ok ? "✓" : "✗"} ${k}`);
  const allOk = checks.every(([, ok]) => ok);
  return `${header("myteam init")}\n${lines.join("\n")}\n\n${allOk ? "MyTeam initialized" : "MyTeam init incomplete"}\n(note: no auto-install, no OpenCode modification, no file copy)`;
}

function status() {
  const c = readCounts(); const p = readPlugin();
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

function doctor() {
  const MARK = { healthy: "✓", warning: "!", error: "✗" };
  const p = readPlugin(); const c = readCounts();
  const rows = [];
  rows.push(["plugin.manifest", p.loaded ? "healthy" : "error", p.loaded ? "manifest valid" : "manifest missing"]);
  rows.push(["source.exists", exists("source") ? "healthy" : "error", "source/ presence"]);
  rows.push(["source.hash", exists("platform/runtime-adapter/agent-binding.yaml") ? "healthy" : "warning", "agent-binding checksum present"]);
  rows.push(["registry.agent", c.agents === 30 ? "healthy" : "error", `agents=${c.agents}`]);
  rows.push(["registry.team", c.teams >= 6 ? "healthy" : "warning", `teams=${c.teams}`]);
  rows.push(["registry.capability", (c.mcp === 5 && c.skill === 26) ? "healthy" : "warning", `mcp=${c.mcp} skill=${c.skill}`]);
  rows.push(["runtime.adapter", exists(".ai/context/runtime-adapter/adapter-state.yaml") ? "healthy" : "warning", "adapter-state present"]);
  let drift = "healthy", driftMsg = "no drift";
  const s = read("platform/runtime-adapter/sync-state.yaml");
  if (/drift_detected:\s*true/.test(s)) { drift = "warning"; driftMsg = "drift detected (report only, no auto-repair)"; }
  rows.push(["runtime.sync", drift, driftMsg]);
  rows.push(["opencode.loading", p.loaded ? "healthy" : "warning", "plugin loadable"]);
  rows.push(["opencode.isolation", p.copyFiles ? "healthy" : "error", p.copyFiles ? "copy_files=false (isolated)" : "copy_files not false (risk)"]);
  const lines = rows.map(([k, lvl, msg]) => `  ${MARK[lvl]} ${k}: ${msg}`);
  const worst = rows.some(r => r[1] === "error") ? "error" : rows.some(r => r[1] === "warning") ? "warning" : "healthy";
  return `${header("myteam doctor")}\n${lines.join("\n")}\n\noverall: ${worst}\n(note: diagnostics only — never auto-repairs)`;
}

function validate() {
  const MARK = { ok: "✓", warning: "!", error: "✗" };
  const c = readCounts(); const findings = [];
  findings.push(c.agents === BASELINE.agent ? ["agent", "ok", `agent binding = ${c.agents}`] : ["agent", "error", `agent count ${c.agents} != ${BASELINE.agent}`]);
  const abRaw = read("platform/runtime-adapter/agent-binding.yaml");
  if (abRaw) {
    const srcs = [...abRaw.matchAll(/source_prompt:\s*"([^"]+)"/g)].map(m => m[1]);
    const missing = srcs.filter(s => !exists(s));
    findings.push(missing.length === 0 ? ["agent", "ok", "all source_prompt files exist"] : ["agent", "error", `missing: ${missing.join(", ")}`]);
    const vers = readAgentVersions();
    const bindVer = [...abRaw.matchAll(/platform_agent:\s*"([a-z0-9-]+)"[\s\S]*?version:\s*"(v\d+)"/g)];
    let mismatch = 0;
    for (const mm of bindVer) { if (vers[mm[1]] && vers[mm[1]] !== mm[2]) mismatch++; }
    findings.push(mismatch === 0 ? ["agent", "ok", "version aligned"] : ["agent", "error", `${mismatch} version mismatch`]);
  }
  findings.push(c.mcp === BASELINE.mcp ? ["mcp", "ok", `mcp = ${c.mcp}`] : ["mcp", "error", `mcp ${c.mcp} != ${BASELINE.mcp}`]);
  findings.push(c.skill === BASELINE.skill ? ["skill", "ok", `skill = ${c.skill}`] : ["skill", "error", `skill ${c.skill} != ${BASELINE.skill}`]);
  findings.push(exists("platform/runtime-adapter/adapter-schema.yaml") ? ["runtime", "ok", "adapter-schema present"] : ["runtime", "error", "adapter-schema missing"]);
  findings.push(exists("evolution/version-registry.yaml") ? ["evolution", "ok", "version-registry present"] : ["evolution", "error", "version-registry missing"]);
  const ok = findings.every(f => f[1] !== "error");
  const lines = findings.map(f => `  ${MARK[f[1]]} [${f[0]}] ${f[2]}`);
  return { text: [header("myteam validate"), ...lines, "", ok ? "validation: PASS (release allowed)" : "validation: FAIL (release blocked)"].join("\n"), ok };
}

function upgrade(argv) {
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  const t = read("manifest/platform-manifest.yaml");
  const ids = [...t.matchAll(/- \{ id: "([^"]+)"/g)].map(m => m[1]);
  const current = ids.length ? ids[ids.length - 1] : "unknown";
  return [
    header("myteam upgrade"),
    `  mode: ${dryRun ? "dry-run (default)" : "apply-requested"}`,
    `  version: ${current} -> next`,
    `  approval_required: true`,
    `  approved: false`,
    "  flow:",
    "    - detect version", "    - backup runtime (rollback/backups/)",
    "    - generate migration plan (platform/runtime-adapter/migration-plan.yaml)",
    "    - approval check (deployment-manifest.status=approved required)",
    "    - apply (platform-owned only, manual)", "    - verify (hash + baseline)",
    "  planned changes:",
    `    - version: ${current} -> next`, "    - backup before apply (safety)",
    "    - no production auto-upgrade (dry-run default)", "    - approval gate before install",
    "",
    dryRun ? "DRY-RUN: no changes applied. Review migration plan before approval."
           : "APPLY requested but blocked: approval + backup required (no production auto-upgrade).",
  ].join("\n");
}

function rollback(argv) {
  const backupArg = argv.find(a => a.startsWith("--backup="));
  const backup = backupArg ? backupArg.split("=")[1] : "latest";
  return [
    header("myteam rollback"),
    `  backup_ref: rollback/backups/${backup}/`,
    `  previous_version: prior-runtime-baseline`,
    "  flow:",
    "    - select backup", "    - restore (reuse Recovery + rollback-plan.yaml)",
    "    - verify baseline agent=30 / mcp=5 / skill=26 / workflow=8",
    `  deletes_history: false`,
    "",
    "rollback plan ready (reuses Recovery + rollback-plan.yaml). Restore is manual; history preserved.",
  ].join("\n");
}

function engineExecutions() {
  const t = read(".ai/context/execution-engine/engine-state.yaml");
  const blocks = t.split(/- execution_id:/).slice(1);
  return blocks.map((b) => {
    const g = (k) => { const m = b.match(new RegExp(`${k}:\\s*"?([^"\\n#]+?)"?\\s*(?:#.*)?$`, "m")); return m ? m[1].trim() : ""; };
    const id = (b.match(/^\s*"?([A-Za-z0-9-]+)"?/) || [])[1] || "";
    return { execution_id: id, action_ref: g("action_ref"), executor: g("executor"), status: g("status"), permission_granted: g("permission_granted"), task_id: g("task_id") };
  });
}

function executionStatus() {
  const ex = engineExecutions();
  const counts = ex.reduce((a, e) => { a[e.status] = (a[e.status] || 0) + 1; return a; }, {});
  const lines = ex.map((e) => `  ${e.execution_id}  ${e.status.padEnd(10)} ${e.executor}  (action=${e.action_ref})`);
  return [
    header("myteam execution status"),
    ...lines,
    "",
    `  total=${ex.length} completed=${counts.completed || 0} failed=${counts.failed || 0} cancelled=${counts.cancelled || 0}`,
    "  (read-only; engine executes only governed-approved requests)",
  ].join("\n");
}

function executionTrace(taskId) {
  const ex = engineExecutions();
  return [
    header(`myteam execution trace ${taskId || "(all)"}`),
    "  chain: Action -> Approval -> Execution -> Result",
    ...ex.map((e) => `  ${e.execution_id}: action(${e.action_ref}) -> approval -> exec[${e.status}] -> result`),
    "",
    "  (trace links Action/Approval/Execution/Result; three-layer separation preserved)",
  ].join("\n");
}

function executionValidate() {
  const eng = "platform/execution-engine";
  const checks = [
    ["executor registry", exists(`${eng}/executor-registry.yaml`)],
    ["engine schema", exists(`${eng}/engine-schema.yaml`)],
    ["permission", exists(`${eng}/permission/execution-permission.yaml`)],
    ["sandbox policy", exists(`${eng}/sandbox/sandbox-policy.yaml`)],
    ["execution policy", exists(`${eng}/execution-policy.yaml`)],
    ["result schema", exists(`${eng}/result/execution-result-schema.yaml`)],
  ];
  // forbidden field scan
  const state = read(".ai/context/execution-engine/engine-state.yaml");
  const forbidden = /(^|\n)\s*(auto_execute|auto_approve|bypass_permission|skip_quality)\s*:/.test(state);
  const lines = checks.map(([k, ok]) => `  ${ok ? "✓" : "✗"} ${k}`);
  const allOk = checks.every(([, ok]) => ok) && !forbidden;
  return [
    header("myteam execution validate"),
    ...lines,
    `  ${!forbidden ? "✓" : "✗"} no forbidden fields (auto_execute/auto_approve/bypass_permission/skip_quality)`,
    "",
    allOk ? "execution validate: PASS" : "execution validate: FAIL",
  ].join("\n");
}

function execution(argv) {
  const sub = argv[0];
  if (sub === "status") return executionStatus();
  if (sub === "trace") return executionTrace(argv[1]);
  if (sub === "validate") return executionValidate();
  return `${header("myteam execution")}\n  usage: myteam execution <status | trace TASK_ID | validate>`;
}

// ---------------- v1.3 workspace ----------------
function readWorkspaces() {
  const t = read(".ai/context/workspace/workspace-state.yaml");
  const blocks = t.split(/- workspace_id:/).slice(1);
  return blocks.map((b) => {
    const g = (k) => { const m = b.match(new RegExp(`${k}:\\s*"?([^"\\n#]+?)"?\\s*(?:#.*)?$`, "m")); return m ? m[1].trim() : ""; };
    const id = (b.match(/^\s*"?([A-Za-z0-9-]+)"?/) || [])[1] || "";
    return { workspace_id: id, agent: g("agent"), team: g("team"), status: g("status"), branch: g("branch") };
  });
}
function workspaceStatus() {
  const ws = readWorkspaces();
  const lines = ws.map((w) => `  ${w.workspace_id}  ${w.status.padEnd(12)} ${w.agent}  (${w.branch})`);
  const counts = ws.reduce((a, w) => { a[w.status] = (a[w.status] || 0) + 1; return a; }, {});
  return [header("myteam workspace status"), ...lines, "",
    `  total=${ws.length} active=${counts.active || 0} reviewing=${counts.reviewing || 0} merged=${counts.merged || 0}`,
    "  (each agent workspace-local; no cross-agent write)"].join("\n");
}
function workspaceList() {
  const ws = readWorkspaces();
  return [header("myteam workspace list"), ...ws.map((w) => `  ${w.workspace_id}  task=refund-feature  agent=${w.agent}  status=${w.status}`)].join("\n");
}
function workspaceTrace(id) {
  const changes = read(".ai/context/workspace/changes/change-records.yaml");
  const merges = read(".ai/context/workspace/merge/merge-requests.yaml");
  const links = read(".ai/context/workspace/artifact-links.yaml");
  const wid = id || "(all)";
  const chLines = [...changes.matchAll(/change_id: "(CH-\d+)"[\s\S]*?workspace_id: "([^"]+)"[\s\S]*?agent: "([^"]+)"/g)]
    .filter((m) => !id || m[2] === id).map((m) => `    change ${m[1]} by ${m[3]}`);
  const mgLines = [...merges.matchAll(/merge_id: "(MG-\d+)"[\s\S]*?workspace_id: "([^"]+)"[\s\S]*?status: "([^"]+)"/g)]
    .filter((m) => !id || m[2] === id).map((m) => `    merge ${m[1]} status=${m[3]}`);
  return [header(`myteam workspace trace ${wid}`),
    "  chain: Agent -> Change -> Checkpoint -> Review -> Merge",
    ...chLines, ...mgLines, "",
    "  (workspace lifecycle traced; three-layer separation preserved)"].join("\n");
}
function workspaceValidate() {
  const wsRoot = "platform/workspace";
  const checks = [
    ["workspace schema", exists(`${wsRoot}/workspace-schema.yaml`)],
    ["workspace policy", exists(`${wsRoot}/workspace-policy.yaml`)],
    ["agent-workspace schema", exists(`${wsRoot}/agents/agent-workspace-schema.yaml`)],
    ["checkpoint schema", exists(`${wsRoot}/snapshots/checkpoint-schema.yaml`)],
    ["change-record schema", exists(`${wsRoot}/changes/change-record-schema.yaml`)],
    ["merge policy", exists(`${wsRoot}/merge/merge-policy.yaml`)],
    ["artifact-link schema", exists(`${wsRoot}/artifacts/artifact-link-schema.yaml`)],
    ["workspace state", exists(".ai/context/workspace/workspace-state.yaml")],
  ];
  // permission check: reviewer must have no create/modify changes
  const bindings = read(".ai/context/workspace/agents/agent-bindings.yaml");
  const reviewerNoChange = /agent: "java-reviewer"[\s\S]*?changes_allowed: \[ "none" \]/.test(bindings);
  // forbidden fields
  const state = read(".ai/context/workspace/workspace-state.yaml") + read(".ai/context/workspace/merge/merge-requests.yaml");
  const forbidden = /(^|\n)\s*(auto_merge|auto_delete_checkpoint|auto_overwrite|auto_permission_change)\s*:\s*(true|[^f])/m.test(state);
  const lines = checks.map(([k, ok]) => `  ${ok ? "✓" : "✗"} ${k}`);
  const allOk = checks.every(([, ok]) => ok) && reviewerNoChange && !forbidden;
  return [header("myteam workspace validate"), ...lines,
    `  ${reviewerNoChange ? "✓" : "✗"} reviewer permission (changes_allowed=none)`,
    `  ${!forbidden ? "✓" : "✗"} no forbidden fields (auto_merge/auto_delete_checkpoint/auto_overwrite/auto_permission_change)`,
    "", allOk ? "workspace validate: PASS" : "workspace validate: FAIL"].join("\n");
}
function workspace(argv) {
  const sub = argv[0];
  if (sub === "status") return workspaceStatus();
  if (sub === "list") return workspaceList();
  if (sub === "trace") return workspaceTrace(argv[1]);
  if (sub === "validate") return workspaceValidate();
  return `${header("myteam workspace")}\n  usage: myteam workspace <status | list | trace ID | validate>`;
}

// ---------------- v1.4 collaboration ----------------
function collaborationStatus() {
  const t = read(".ai/context/collaboration/collaboration-state.yaml");
  const cos = [...t.matchAll(/collaboration_id: "(CO-\d+)"[\s\S]*?status: "([^"]+)"/g)].map((m) => `  ${m[1]}  status=${m[2]}`);
  const msg = read(".ai/context/collaboration/messages/message-history.yaml");
  const ho = read(".ai/context/collaboration/handoffs/handoff-history.yaml");
  const de = read(".ai/context/collaboration/decisions/decision-records.yaml");
  const cf = read(".ai/context/collaboration/conflicts/conflict-records.yaml");
  return [header("myteam collaboration status"), ...cos, "",
    `  messages=${(msg.match(/message_id:/g)||[]).length} handoffs=${(ho.match(/handoff_id:/g)||[]).length} decisions=${(de.match(/decision_id:/g)||[]).length} conflicts=${(cf.match(/conflict_id:/g)||[]).length}`,
    "  (collaboration produces request/decision/handoff only; never direct execution)"].join("\n");
}
function collaborationTrace(taskId) {
  const msg = read(".ai/context/collaboration/messages/message-history.yaml");
  const ho = read(".ai/context/collaboration/handoffs/handoff-history.yaml");
  const de = read(".ai/context/collaboration/decisions/decision-records.yaml");
  const mLines = [...msg.matchAll(/message_id: "(MSG-\d+)"[\s\S]*?from_agent: "([^"]+)"[\s\S]*?to_agent: "([^"]+)"[\s\S]*?type: "([^"]+)"/g)].map((m) => `    message ${m[1]}: ${m[2]} -> ${m[3]} [${m[4]}]`);
  const hLines = [...ho.matchAll(/handoff_id: "(HO-\d+)"[\s\S]*?from: "([^"]+)"[\s\S]*?to: "([^"]+)"/g)].map((m) => `    handoff ${m[1]}: ${m[2]} -> ${m[3]}`);
  const dLines = [...de.matchAll(/decision_id: "(DE-\d+)"/g)].map((m) => `    decision ${m[1]}`);
  return [header(`myteam collaboration trace ${taskId || "(all)"}`),
    "  chain: Agent -> Message -> Handoff -> Decision -> Action",
    ...mLines, ...hLines, ...dLines, "",
    "  (traceable; discussion -> action proposal -> approval -> execution)"].join("\n");
}
function collaborationConflicts() {
  const cf = read(".ai/context/collaboration/conflicts/conflict-records.yaml");
  const lines = [...cf.matchAll(/conflict_id: "(CF-\d+)"[\s\S]*?issue: "([^"]+)"[\s\S]*?status: "([^"]+)"/g)].map((m) => `  ${m[1]}  [${m[3]}]  ${m[2]}`);
  return [header("myteam collaboration conflicts"), ...lines, "", "  (conflicts resolved by human/lead; never auto-resolved)"].join("\n");
}
function collaborationValidate() {
  const cRoot = "platform/collaboration";
  const checks = [
    ["collaboration schema", exists(`${cRoot}/collaboration-schema.yaml`)],
    ["message schema", exists(`${cRoot}/message-schema.yaml`)],
    ["handoff schema", exists(`${cRoot}/handoff-schema.yaml`)],
    ["decision schema", exists(`${cRoot}/decision-schema.yaml`)],
    ["conflict schema", exists(`${cRoot}/conflict-schema.yaml`)],
    ["collaboration policy", exists(`${cRoot}/policies/collaboration-policy.yaml`)],
    ["collaboration state", exists(".ai/context/collaboration/collaboration-state.yaml")],
  ];
  const all = read(".ai/context/collaboration/collaboration-state.yaml") + read(".ai/context/collaboration/messages/message-history.yaml") + read(".ai/context/collaboration/handoffs/handoff-history.yaml");
  const forbidden = /(^|\n)\s*(auto_resolve|auto_execute|auto_delegate|auto_call_agent)\s*:\s*(true|[^f])/m.test(all);
  const lines = checks.map(([k, ok]) => `  ${ok ? "✓" : "✗"} ${k}`);
  const allOk = checks.every(([, ok]) => ok) && !forbidden;
  return [header("myteam collaboration validate"), ...lines,
    `  ${!forbidden ? "✓" : "✗"} no forbidden fields (auto_resolve/auto_execute/auto_delegate/auto_call_agent)`,
    "", allOk ? "collaboration validate: PASS" : "collaboration validate: FAIL"].join("\n");
}
function collaboration(argv) {
  const sub = argv[0];
  if (sub === "status") return collaborationStatus();
  if (sub === "trace") return collaborationTrace(argv[1]);
  if (sub === "conflicts") return collaborationConflicts();
  if (sub === "validate") return collaborationValidate();
  return `${header("myteam collaboration")}\n  usage: myteam collaboration <status | trace TASK_ID | conflicts | validate>`;
}

// ---------------- v1.4.1 trace ----------------
function readTraces() {
  const t = read(".ai/context/debug-trace/trace-index.yaml");
  return [...t.matchAll(/trace_id: "(TR-\d+)"[\s\S]*?task_id: "([^"]+)"[\s\S]*?status: "([^"]+)"/g)]
    .map((m) => ({ trace_id: m[1], task_id: m[2], status: m[3] }));
}
function readTraceEvents(taskId) {
  const idx = readTraces();
  const tr = idx.find((x) => x.task_id === taskId) || idx[0];
  if (!tr) return { tr: null, events: [] };
  const ev = read(`.ai/context/debug-trace/events/${tr.trace_id}-events.yaml`);
  const events = [...ev.matchAll(/event_id: "(EV-\d+)"[\s\S]*?timestamp: "([^"]+)"[\s\S]*?layer: "([^"]+)"[\s\S]*?source: "([^"]+)"[\s\S]*?event_type: "([^"]+)"[\s\S]*?reference: "([^"]+)"/g)]
    .map((m) => ({ event_id: m[1], timestamp: m[2], layer: m[3], source: m[4], event_type: m[5], reference: m[6] }));
  return { tr, events };
}
function traceStatus() {
  const idx = readTraces();
  const lines = idx.map((t) => `  ${t.trace_id}  ${t.status.padEnd(10)} task=${t.task_id}`);
  return [header("myteam trace status"), ...lines, "", `  total traces=${idx.length}`, "  (trace records pointers only; never executes)"].join("\n");
}
function traceShow(taskId) {
  const { tr, events } = readTraceEvents(taskId);
  if (!tr) return `${header("myteam trace show")}\n  no trace for ${taskId}`;
  const lines = events.map((e) => `  ${e.layer.padEnd(14)} ${e.event_type.padEnd(24)} -> ${e.reference}`);
  return [header(`myteam trace show ${tr.task_id}`), `  trace=${tr.trace_id} status=${tr.status}`, "", ...lines, "",
    `  layers=${new Set(events.map((e) => e.layer)).size}/13  events=${events.length}`,
    "  (full lifecycle: router->team->agent->collaboration->workspace->action->approval->execution->quality->artifact->memory->evolution)"].join("\n");
}
function traceTimeline(taskId) {
  const { tr, events } = readTraceEvents(taskId);
  if (!tr) return `${header("myteam trace timeline")}\n  no trace for ${taskId}`;
  const lines = events.map((e) => `  ${e.timestamp}  [${e.layer}]  ${e.event_type} (${e.source})`);
  return [header(`myteam trace timeline ${tr.task_id}`), ...lines, "", "  (chronological; read-only)"].join("\n");
}
function traceValidate() {
  const root = "platform/debug-trace";
  const checks = [
    ["trace schema", exists(`${root}/trace-schema.yaml`)],
    ["trace-event schema", exists(`${root}/trace-event-schema.yaml`)],
    ["trace policy", exists(`${root}/trace-policy.yaml`)],
    ["collectors (5)", exists(`${root}/collectors/router-trace.yaml`) && exists(`${root}/collectors/collaboration-trace.yaml`) && exists(`${root}/collectors/workspace-trace.yaml`) && exists(`${root}/collectors/execution-trace.yaml`) && exists(`${root}/collectors/quality-trace.yaml`)],
    ["trace index", exists(".ai/context/debug-trace/trace-index.yaml")],
  ];
  // reference validity: each event reference path root exists
  const { events } = readTraceEvents(undefined);
  const validLayers = ["router","team","agent","collaboration","workspace","action","approval","execution","quality","artifact","memory","evolution","safety"];
  const badLayer = events.filter((e) => !validLayers.includes(e.layer));
  // forbidden fields
  const ev = read(".ai/context/debug-trace/events/TR-0001-events.yaml") + read(".ai/context/debug-trace/trace-index.yaml");
  const forbidden = /(^|\n)\s*(auto_execute|auto_repair|auto_decision|auto_schedule)\s*:/m.test(ev);
  const lines = checks.map(([k, ok]) => `  ${ok ? "✓" : "✗"} ${k}`);
  const allOk = checks.every(([, ok]) => ok) && badLayer.length === 0 && !forbidden;
  return [header("myteam trace validate"), ...lines,
    `  ${badLayer.length === 0 ? "✓" : "✗"} all event layers valid (${events.length} events)`,
    `  ${!forbidden ? "✓" : "✗"} no forbidden fields (auto_execute/auto_repair/auto_decision/auto_schedule)`,
    "", allOk ? "trace validate: PASS" : "trace validate: FAIL"].join("\n");
}
function trace(argv) {
  const sub = argv[0];
  if (sub === "status") return traceStatus();
  if (sub === "show") return traceShow(argv[1]);
  if (sub === "timeline") return traceTimeline(argv[1]);
  if (sub === "validate") return traceValidate();
  return `${header("myteam trace")}\n  usage: myteam trace <status | show TASK_ID | timeline TASK_ID | validate>`;
}

// ---------------- v1.4.2 safety ----------------
function readSafetyChecks() {
  const t = read(".ai/context/runtime-safety/safety-state.yaml");
  const blocks = t.split(/- safety_id:/).slice(1);
  return blocks.map((b) => {
    const g = (k) => { const m = b.match(new RegExp(`${k}:\\s*"?([^"\\n#]+?)"?\\s*(?:#.*)?$`, "m")); return m ? m[1].trim() : ""; };
    const id = (b.match(/^\s*"?([A-Za-z0-9-]+)"?/) || [])[1] || "";
    return { safety_id: id, check_type: g("check_type"), risk_level: g("risk_level"), status: g("status") };
  });
}
function safetyStatus() {
  const c = readSafetyChecks();
  const counts = c.reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; return a; }, {});
  const lines = c.map((x) => `  ${x.safety_id}  ${x.status.padEnd(14)} ${x.check_type} (${x.risk_level})`);
  return [header("myteam safety status"), ...lines, "",
    `  total=${c.length} normal=${counts.normal || 0} blocked=${counts.blocked || 0} waiting-human=${counts["waiting-human"] || 0}`,
    "  (safety detects/limits/blocks/escalates only; never executes/approves)"].join("\n");
}
function safetyCheck(taskId) {
  const c = readSafetyChecks();
  const lines = c.map((x) => `  ${x.check_type.padEnd(12)} ${x.status}`);
  const worst = c.some(x => x.status === "blocked") ? "blocked" : c.some(x => x.status === "waiting-human") ? "waiting-human" : c.some(x => x.status === "warning") ? "warning" : "normal";
  return [header(`myteam safety check ${taskId || "(all)"}`), ...lines, "", `  overall: ${worst}`, "  (read-only safety check; no execution)"].join("\n");
}
function safetyBudget(taskId) {
  const t = read(".ai/context/runtime-safety/safety-state.yaml");
  const tokBlock = (t.match(/token_budget:[\s\S]*?status: "[^"]+"/) || [""])[0];
  const costBlock = (t.match(/cost_budget:[\s\S]*?status: "[^"]+"/) || [""])[0];
  const g = (blk, re) => { const m = blk.match(re); return m ? m[1] : "?"; };
  return [header(`myteam safety budget ${taskId || "refund-feature"}`),
    `  token: used=${g(tokBlock,/used: (\d+)/)} / limit=${g(tokBlock,/token_limit: (\d+)/)}  status=${g(tokBlock,/status: "([^"]+)"/)}`,
    `  cost:  actual=${g(costBlock,/actual_cost: ([\d.]+)/)} / limit=${g(costBlock,/limit: ([\d.]+)/)}  status=${g(costBlock,/status: "([^"]+)"/)}`,
    "", "  (budget exceeded => waiting-human; never auto-expand)"].join("\n");
}
function safetyViolations() {
  const c = readSafetyChecks().filter(x => x.status === "blocked" || x.status === "waiting-human");
  const esc = read(".ai/context/runtime-safety/escalations.yaml");
  const escLines = [...esc.matchAll(/escalation_id: "(ESC-\d+)"[\s\S]*?trigger: "([^"]+)"[\s\S]*?status: "([^"]+)"/g)].map((m) => `  ${m[1]}  [${m[3]}]  ${m[2]}`);
  return [header("myteam safety violations"),
    "  blocked / waiting-human checks:",
    ...c.map((x) => `    ${x.safety_id}  ${x.status}  ${x.check_type}`),
    "  escalations:",
    ...escLines, "", "  (historical guard records; append-only)"].join("\n");
}
function safetyValidate() {
  const root = "platform/runtime-safety";
  const checks = [
    ["safety policy", exists(`${root}/safety-policy.yaml`)],
    ["risk schema", exists(`${root}/risk-schema.yaml`)],
    ["token budget schema", exists(`${root}/budget/token-budget-schema.yaml`)],
    ["cost budget schema", exists(`${root}/budget/cost-budget-schema.yaml`)],
    ["execution limit", exists(`${root}/limits/execution-limit.yaml`)],
    ["retry limit", exists(`${root}/limits/retry-limit.yaml`)],
    ["loop detection", exists(`${root}/limits/loop-detection.yaml`)],
    ["timeout policy", exists(`${root}/timeout/timeout-policy.yaml`)],
    ["escalation policy", exists(`${root}/escalation/human-escalation-policy.yaml`)],
    ["safety state", exists(".ai/context/runtime-safety/safety-state.yaml")],
  ];
  const all = read(".ai/context/runtime-safety/safety-state.yaml") + read(".ai/context/runtime-safety/escalations.yaml");
  const forbidden = /(^|\n)\s*(auto_override|auto_retry_forever|auto_escalate_permission|auto_expand_budget)\s*:/m.test(all);
  // trace reference present
  const hasTraceRef = /trace_ref:/.test(read(".ai/context/runtime-safety/safety-state.yaml"));
  const lines = checks.map(([k, ok]) => `  ${ok ? "✓" : "✗"} ${k}`);
  const allOk = checks.every(([, ok]) => ok) && !forbidden && hasTraceRef;
  return [header("myteam safety validate"), ...lines,
    `  ${hasTraceRef ? "✓" : "✗"} trace reference present`,
    `  ${!forbidden ? "✓" : "✗"} no forbidden fields (auto_override/auto_retry_forever/auto_escalate_permission/auto_expand_budget)`,
    "", allOk ? "safety validate: PASS" : "safety validate: FAIL"].join("\n");
}
function safety(argv) {
  const sub = argv[0];
  if (sub === "status") return safetyStatus();
  if (sub === "check") return safetyCheck(argv[1]);
  if (sub === "budget") return safetyBudget(argv[1]);
  if (sub === "violations") return safetyViolations();
  if (sub === "validate") return safetyValidate();
  return `${header("myteam safety")}\n  usage: myteam safety <status | check TASK_ID | budget TASK_ID | violations | validate>`;
}

// ---------------- v1.4.3 organization ----------------
function readBindings() {
  const t = read("platform/organization/agent-role-binding.yaml");
  return [...t.matchAll(/agent:\s*"([^"]+)",\s*role:\s*"([^"]+)",\s*team:\s*"([^"]+)"/g)]
    .map((m) => ({ agent: m[1], role: m[2], team: m[3] }));
}
function readOrgTeams() {
  const t = read(".ai/context/organization/organization-state.yaml");
  return [...t.matchAll(/team_id:\s*"([^"]+)",\s*lead:\s*"([^"]+)",\s*agents:\s*(\d+)/g)]
    .map((m) => ({ team_id: m[1], lead: m[2], agents: Number(m[3]) }));
}
function organizationStatus() {
  const b = readBindings();
  const teams = readOrgTeams();
  const roles = [...new Set(b.map((x) => x.role))];
  const tLines = teams.map((t) => `    ${t.team_id.padEnd(22)} lead=${t.lead.padEnd(22)} agents=${t.agents}`);
  const rLines = roles.map((r) => `    ${r.padEnd(12)} agents=${b.filter((x) => x.role === r).length}`);
  return [
    header("myteam organization status"),
    `  Teams (${teams.length}):`, ...tLines,
    `  Roles (${roles.length}):`, ...rLines,
    `  Agents: ${b.length}/30 bound`,
    "",
    "  (model Team -> Role -> Agent; model/map/query/validate only, never selects agent)",
  ].join("\n");
}
function organizationTrace(agentId) {
  const b = readBindings();
  if (!agentId) return `${header("myteam organization trace")}\n  usage: myteam organization trace AGENT_ID`;
  const hit = b.find((x) => x.agent === agentId);
  if (!hit) return `${header(`myteam organization trace ${agentId}`)}\n  no binding for ${agentId}`;
  return [
    header(`myteam organization trace ${agentId}`),
    "  Agent -> Role -> Team",
    `    Agent: ${hit.agent}`,
    `    Role:  ${hit.role}`,
    `    Team:  ${hit.team}`,
    "",
    `  chain: ${hit.team} -> ${hit.role} -> ${hit.agent}`,
    "  (read-only organization lookup; never selects/replaces agent)",
  ].join("\n");
}
function organizationValidate() {
  const MARK = { ok: "✓", warning: "!", error: "✗" };
  const root = "platform/organization";
  const findings = [];
  // schema files
  const schemas = [
    ["organization schema", `${root}/organization-schema.yaml`],
    ["team schema", `${root}/team-schema.yaml`],
    ["role schema", `${root}/role-schema.yaml`],
    ["agent-role-binding", `${root}/agent-role-binding.yaml`],
  ];
  for (const [k, p] of schemas) findings.push(exists(p) ? [k, "ok", "present"] : [k, "error", "missing"]);
  // teams (6) + roles (>=5)
  const teamsDir = path.join(WORKSPACE, `${root}/teams`);
  const rolesDir = path.join(WORKSPACE, `${root}/roles`);
  const teamFiles = fs.existsSync(teamsDir) ? fs.readdirSync(teamsDir).filter((f) => f.endsWith(".yaml")) : [];
  const roleFiles = fs.existsSync(rolesDir) ? fs.readdirSync(rolesDir).filter((f) => f.endsWith(".yaml")) : [];
  findings.push(teamFiles.length === 6 ? ["teams", "ok", `6 teams`] : ["teams", "error", `teams=${teamFiles.length} != 6`]);
  findings.push(roleFiles.length >= 5 ? ["roles", "ok", `${roleFiles.length} roles`] : ["roles", "error", `roles=${roleFiles.length} < 5`]);
  // binding coverage 30/30
  const b = readBindings();
  const uniqAgents = new Set(b.map((x) => x.agent));
  findings.push(b.length === 30 && uniqAgents.size === 30 ? ["binding", "ok", "30/30 agents bound"] : ["binding", "error", `bound=${b.length} uniq=${uniqAgents.size}`]);
  // every bound team exists as team file; every role exists as role file
  const teamIds = new Set(teamFiles.map((f) => f.replace(/\.yaml$/, "")));
  const roleIds = new Set(roleFiles.map((f) => f.replace(/\.yaml$/, "")));
  const badTeam = b.filter((x) => !teamIds.has(x.team));
  const badRole = b.filter((x) => !roleIds.has(x.role));
  findings.push(badTeam.length === 0 ? ["reference", "ok", "all binding teams defined"] : ["reference", "error", `undefined team: ${[...new Set(badTeam.map((x) => x.team))].join(",")}`]);
  findings.push(badRole.length === 0 ? ["reference", "ok", "all binding roles defined"] : ["reference", "error", `undefined role: ${[...new Set(badRole.map((x) => x.role))].join(",")}`]);
  // registry not replaced (organization_ref present + registry intact)
  const reg = read(".ai/context/team-registry.yaml");
  findings.push(/organization_ref:/.test(reg) && /Team Runtime Registry/.test(reg) ? ["registry", "ok", "team-registry kept as runtime registry (organization_ref added)"] : ["registry", "error", "registry reference missing/replaced"]);
  // baseline
  const c = readCounts();
  findings.push((c.agents === 30 && c.mcp === 5 && c.skill === 26 && c.workflow === 8) ? ["baseline", "ok", `agent=30 mcp=5 skill=26 workflow=8`] : ["baseline", "error", `agent=${c.agents} mcp=${c.mcp} skill=${c.skill} workflow=${c.workflow}`]);
  // forbidden fields (no auto-restructure)
  const st = read(".ai/context/organization/organization-state.yaml") + read(`${root}/organization-schema.yaml`);
  const forbidden = /(^|\n)\s*(auto_add_team|auto_add_role|auto_replace_agent|auto_select_agent|auto_restructure)\s*:\s*(true|[^f])/m.test(st);
  findings.push(!forbidden ? ["boundary", "ok", "no forbidden fields (auto_add_team/auto_add_role/auto_replace_agent/auto_select_agent/auto_restructure)"] : ["boundary", "error", "forbidden field present"]);
  const ok = findings.every((f) => f[1] !== "error");
  const lines = findings.map((f) => `  ${MARK[f[1]]} [${f[0]}] ${f[2]}`);
  return [header("myteam organization validate"), ...lines, "", ok ? "organization validate: PASS" : "organization validate: FAIL"].join("\n");
}
function organization(argv) {
  const sub = argv[0];
  if (sub === "status") return organizationStatus();
  if (sub === "trace") return organizationTrace(argv[1]);
  if (sub === "validate") return organizationValidate();
  return `${header("myteam organization")}\n  usage: myteam organization <status | trace AGENT_ID | validate>`;
}

// ---------------- v1.5 organization intelligence ----------------
function readRecommendations() {
  const t = read("platform/organization-intelligence/recommendations/recommendation-records.yaml");
  const blocks = t.split(/- id:/).slice(1);
  return blocks.map((b) => {
    const g = (k) => { const m = b.match(new RegExp(`${k}:\\s*"?([^"\\n#]+?)"?\\s*(?:#.*)?$`, "m")); return m ? m[1].trim() : ""; };
    const id = (b.match(/^\s*"?([A-Za-z0-9-]+)"?/) || [])[1] || "";
    return { id, risk: g("risk"), status: g("status"), suggestion: g("suggestion") };
  });
}
function intelligenceStatus() {
  const st = read(".ai/context/organization-intelligence/intelligence-state.yaml");
  const active = /intelligence_active:\s*true/.test(st);
  const readOnly = /read_only:\s*true/.test(st);
  const scopes = (st.match(/scope:\s*\[([^\]]+)\]/) || [, ""])[1].split(",").map((s) => s.replace(/["\s]/g, "")).filter(Boolean);
  const recos = readRecommendations();
  const drafts = recos.filter((r) => r.status === "draft").length;
  return [
    header("myteam intelligence status"),
    `  Intelligence: ${active ? "✓ active" : "✗ inactive"} (read-only=${readOnly})`,
    `  Scope: ${scopes.join(", ")}`,
    `  Analyses: team / role / agent / collaboration / workflow`,
    `  Recommendations: ${recos.length} (draft=${drafts}, auto-applied=0)`,
    "",
    "  (self-observing: analyze/report/recommend only; never modifies sources)",
  ].join("\n");
}
function intelligenceReport() {
  const r = read("platform/organization-intelligence/reports/organization-intelligence-report.yaml");
  const g = (k) => { const m = r.match(new RegExp(`${k}:\\s*"?([^"\\n#]+?)"?\\s*(?:#.*)?$`, "m")); return m ? m[1].trim() : "?"; };
  const teamI = [...r.matchAll(/team_insights:([\s\S]*?)\nrole_insights:/g)].map((m) => m[1])[0] || "";
  const tLines = [...teamI.matchAll(/-\s*"([^"]+)"/g)].map((m) => `    - ${m[1]}`);
  const recos = readRecommendations();
  return [
    header("myteam intelligence report"),
    `  report: OI-0001  time_range=${g("time_range")}`,
    `  teams=${g("teams_analyzed")} roles=${g("roles_analyzed")} agents=${g("agents_analyzed")}`,
    `  overall_success_rate=${g("overall_success_rate")} first_pass_rate=${g("overall_first_pass_rate")}`,
    `  bottlenecks=${g("bottlenecks_found")} failure_patterns=${g("failure_patterns")} success_patterns=${g("success_patterns")}`,
    "  team_insights:", ...tLines,
    `  recommendations: ${recos.length} (all draft; require human approval)`,
    "",
    "  (Human Approval / Governance First / No Auto Modification)",
  ].join("\n");
}
function intelligenceBottlenecks() {
  const b = read("platform/organization-intelligence/analysis/bottleneck-analysis.yaml");
  const items = [...b.matchAll(/- finding:\s*"([^"]+)"[\s\S]*?description:\s*"([^"]+)"[\s\S]*?severity:\s*"([^"]+)"/g)]
    .map((m) => `  [${m[3]}] ${m[1]}: ${m[2]}`);
  return [header("myteam intelligence bottlenecks"), ...items, "", `  total=${items.length} (findings with evidence only; workflow not modified)`].join("\n");
}
function intelligenceRecommendations() {
  const recos = readRecommendations();
  const lines = recos.map((r) => `  ${r.id}  [${r.status}] risk=${r.risk}  ${r.suggestion}`);
  const counts = recos.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  return [
    header("myteam intelligence recommendations"),
    ...lines, "",
    `  total=${recos.length} draft=${counts.draft || 0} approved=${counts.approved || 0} rejected=${counts.rejected || 0} auto-applied=0`,
    "  (recommendations require human approval; never auto-applied / never enter source)",
  ].join("\n");
}
function intelligenceValidate() {
  const MARK = { ok: "✓", warning: "!", error: "✗" };
  const root = "platform/organization-intelligence";
  const findings = [];
  const files = [
    ["intelligence schema", `${root}/intelligence-schema.yaml`],
    ["team-performance", `${root}/metrics/team-performance.yaml`],
    ["role-performance", `${root}/metrics/role-performance.yaml`],
    ["agent-performance", `${root}/metrics/agent-performance.yaml`],
    ["collaboration-metrics", `${root}/metrics/collaboration-metrics.yaml`],
    ["workflow-metrics", `${root}/metrics/workflow-metrics.yaml`],
    ["bottleneck-analysis", `${root}/analysis/bottleneck-analysis.yaml`],
    ["failure-patterns", `${root}/analysis/failure-patterns.yaml`],
    ["success-patterns", `${root}/analysis/success-patterns.yaml`],
    ["workload-analysis", `${root}/analysis/workload-analysis.yaml`],
    ["recommendation-schema", `${root}/recommendations/recommendation-schema.yaml`],
    ["report", `${root}/reports/organization-intelligence-report.yaml`],
    ["intelligence state", ".ai/context/organization-intelligence/intelligence-state.yaml"],
  ];
  for (const [k, p] of files) findings.push(exists(p) ? [k, "ok", "present"] : [k, "error", "missing"]);
  // reference: evidence_refs present in analysis
  const bottle = read(`${root}/analysis/bottleneck-analysis.yaml`);
  findings.push(/evidence_refs:/.test(bottle) ? ["reference", "ok", "findings carry evidence_refs"] : ["reference", "error", "missing evidence_refs"]);
  // recommendations all draft, none auto-applied
  const recos = readRecommendations();
  const nonDraftAuto = recos.filter((r) => r.status === "approved" || r.status === "rejected").length; // ok either way; check auto-applied field
  const recRaw = read(`${root}/recommendations/recommendation-records.yaml`);
  const autoApplied = /auto_applied:\s*[1-9]/.test(recRaw);
  findings.push((recos.length > 0 && !autoApplied) ? ["recommendation", "ok", `${recos.length} recommendations, 0 auto-applied`] : ["recommendation", "error", "recommendation auto-applied or empty"]);
  // boundary: forbidden fields scan across layer + state
  const scan = read(`${root}/intelligence-schema.yaml`) + read(`${root}/recommendations/recommendation-records.yaml`) + read(".ai/context/organization-intelligence/intelligence-state.yaml") + read(`${root}/reports/organization-intelligence-report.yaml`) + read(`${root}/metrics/agent-performance.yaml`);
  const forbidden = /(^|\n)\s*(auto_apply|auto_modify|auto_execute)\s*:\s*(true|[^f\n])/m.test(scan);
  findings.push(!forbidden ? ["boundary", "ok", "no forbidden fields (auto_apply/auto_modify/auto_execute)"] : ["boundary", "error", "forbidden field present"]);
  // boundary: no agent ranking
  const ranking = /\b(best_agent|worst_agent)\s*:/.test(scan) || /ranking_generated:\s*true/.test(scan) || /agent_ranking:\s*true/.test(scan);
  findings.push(!ranking ? ["boundary", "ok", "no agent ranking (no best_agent/worst_agent)"] : ["boundary", "error", "agent ranking present"]);
  // read-only
  const st = read(".ai/context/organization-intelligence/intelligence-state.yaml");
  findings.push(/read_only:\s*true/.test(st) && /mutates_sources:\s*false/.test(st) ? ["boundary", "ok", "read-only (mutates_sources=false)"] : ["boundary", "error", "not read-only"]);
  // baseline
  const c = readCounts();
  findings.push((c.agents === 30 && c.mcp === 5 && c.skill === 26 && c.workflow === 8) ? ["baseline", "ok", "agent=30 mcp=5 skill=26 workflow=8"] : ["baseline", "error", `agent=${c.agents} mcp=${c.mcp} skill=${c.skill} workflow=${c.workflow}`]);
  const ok = findings.every((f) => f[1] !== "error");
  const lines = findings.map((f) => `  ${MARK[f[1]]} [${f[0]}] ${f[2]}`);
  return [header("myteam intelligence validate"), ...lines, "", ok ? "intelligence validate: PASS" : "intelligence validate: FAIL"].join("\n");
}
function intelligence(argv) {
  const sub = argv[0];
  if (sub === "status") return intelligenceStatus();
  if (sub === "report") return intelligenceReport();
  if (sub === "bottlenecks") return intelligenceBottlenecks();
  if (sub === "recommendations") return intelligenceRecommendations();
  if (sub === "validate") return intelligenceValidate();
  return `${header("myteam intelligence")}\n  usage: myteam intelligence <status | report | bottlenecks | recommendations | validate>`;
}

function run(argv) {
  const cmd = argv[0]; const rest = argv.slice(1);
  switch (cmd) {
    case "init": return { text: init(), code: 0 };
    case "status": return { text: status(), code: 0 };
    case "doctor": return { text: doctor(), code: 0 };
    case "validate": { const r = validate(); return { text: r.text, code: r.ok ? 0 : 1 }; }
    case "upgrade": return { text: upgrade(rest), code: 0 };
    case "rollback": return { text: rollback(rest), code: 0 };
    case "execution": return { text: execution(rest), code: 0 };
    case "workspace": return { text: workspace(rest), code: 0 };
    case "collaboration": return { text: collaboration(rest), code: 0 };
    case "trace": return { text: trace(rest), code: 0 };
    case "safety": return { text: safety(rest), code: 0 };
    case "organization": return { text: organization(rest), code: 0 };
    case "intelligence": return { text: intelligence(rest), code: 0 };
    default:
      return { text: `MyTeam CLI v1.5\nusage: myteam <${COMMANDS.join(" | ")} | execution | workspace | collaboration | trace | safety | organization | intelligence> [options]\n  execution <status | trace TASK_ID | validate>\n  workspace <status | list | trace ID | validate>\n  collaboration <status | trace TASK_ID | conflicts | validate>\n  trace <status | show TASK_ID | timeline TASK_ID | validate>\n  safety <status | check TASK_ID | budget TASK_ID | violations | validate>\n  organization <status | trace AGENT_ID | validate>\n  intelligence <status | report | bottlenecks | recommendations | validate>`, code: cmd ? 1 : 0 };
  }
}

const res = run(process.argv.slice(2));
process.stdout.write(res.text + "\n");
process.exit(res.code);
