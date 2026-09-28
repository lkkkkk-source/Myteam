/**
 * MyTeam OpenCode Plugin — Execution Store (execution-store.ts) — v1.6.5
 * ---------------------------------------------------------------------------
 * Phase 5 — Execution Persistence Layer（模型存储）。
 *
 * 职责：把 Execution / AgentRun / HumanCheckpoint / Result Artifact 读写到
 *   <project>/.team/runtime/execution/EX-xxx/
 * 只做“内存模型 <-> 文件”的搬运；**不启动 Agent、不调用 Tool、
 * 不实现 Runner、不推进状态机、不实现 Trace**（状态机推进属 Execution Engine）。
 *
 * 约定（沿用项目既有）：
 *   - YAML schema_version 1，极简渲染（JSON.stringify 转义），无外部依赖。
 *   - 原子写：写 *.tmp 后 rename。
 *   - 所有路径派生自 Resolution.team_root；**绝不写 MyTeam Home / 宿主配置**。
 *   - 安全：拒绝 ../ 路径穿越、拒绝写入 myteam_home / ~/.config/opencode。
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Resolution } from "../../workspace-resolver";
import {
  type Execution,
  type ExecutionStatus,
  type AgentRun,
  type HumanCheckpoint,
  type ResultArtifact,
  type ExecutionSummary,
} from "./types";

// ---------------------------------------------------------------------------
// 路径派生（全部基于 Resolution.team_root）
// ---------------------------------------------------------------------------

/** 规范化路径：统一分隔符 + 解析绝对路径。 */
function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, "/");
}

/** execution 目录：<team_root>/runtime/execution/<EX-xxx>/ */
export function executionDir(res: Resolution, executionId: string): string {
  return path.join(res.team_root, "runtime", "execution", executionId);
}

/** 主清单：<exe>/execution.yaml */
export function executionFile(res: Resolution, executionId: string): string {
  return path.join(executionDir(res, executionId), "execution.yaml");
}

/** 计划：<exe>/plan.yaml */
export function planFile(res: Resolution, executionId: string): string {
  return path.join(executionDir(res, executionId), "plan.yaml");
}

/** 运行记录目录：<exe>/runs/ */
export function runsDir(res: Resolution, executionId: string): string {
  return path.join(executionDir(res, executionId), "runs");
}

/** 检查点目录：<exe>/checkpoints/ */
export function checkpointsDir(res: Resolution, executionId: string): string {
  return path.join(executionDir(res, executionId), "checkpoints");
}

/** 结果目录：<exe>/result/ */
export function resultDir(res: Resolution, executionId: string): string {
  return path.join(executionDir(res, executionId), "result");
}

// ---------------------------------------------------------------------------
// 内部工具：YAML 渲染 / 解析 / 原子写 / 安全
// ---------------------------------------------------------------------------

function q(s: string): string {
  return JSON.stringify(s);
}

/** 极简 YAML：仅顶层 key/value + 简单 `-` 列表（对齐项目既有风格）。 */
function renderYaml(headers: string[], bodyLines: string[]): string {
  const L: string[] = [];
  for (const h of headers) L.push(h);
  for (const b of bodyLines) L.push(b);
  return L.join("\n") + "\n";
}

/** 顶层单值字段的读取（去掉首尾引号）。 */
function getField(raw: string, key: string): string {
  const m = raw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!m) return "";
  return m[1]
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1")
    .replace(/\\\\/g, "\\");
}

/** 读取某段后的 `- value` 列表。 */
function getList(raw: string, key: string): string[] {
  const out: string[] = [];
  const re = /^  - "?(.*?)"?\s*$/gm;
  const idx = raw.indexOf(`${key}:`);
  if (idx === -1) return out;
  const after = raw.slice(idx);
  let m: RegExpExecArray | null;
  while ((m = re.exec(after)) !== null) {
    if (m[1] === "" && m[0].trim() === "[]") continue;
    out.push(m[1]);
  }
  return out;
}

/** 校验 execution_id 形如 EX-<数字>，拒绝路径穿越/非法字符。 */
export function assertValidExecutionId(id: string): string {
  if (!/^EX-\d+$/.test(id)) {
    throw new Error(
      `[myteam-execution-store] invalid execution_id: ${id} (must match /^EX-\\d+$/)`
    );
  }
  return id;
}

/** 拒绝写入 deny 域（MyTeam Home / ~/.config/opencode）。 */
export function assertNotDenied(absPath: string, res: Resolution): void {
  const p = norm(absPath);
  const myteamHome = norm(res.myteam_home);
  const hostConf = norm(path.join(os.homedir(), ".config", "opencode"));
  for (const deny of [myteamHome, hostConf]) {
    if (p === deny || p.startsWith(deny + "/")) {
      throw new Error(
        `[myteam-execution-store] forbidden write target (deny domain): ${p}`
      );
    }
  }
}

/** 原子写（tmp + rename）；先确保目录存在。 */
export function writeAtomic(file: string, content: string): string {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, file);
  return file;
}

// ---------------------------------------------------------------------------
// 1. Execution Store：create / load / save / list
// ---------------------------------------------------------------------------

/** 创建一次 execution：建目录骨架 + 写 execution.yaml（status=received）。 */
export function create(res: Resolution, exec: Execution): Execution {
  assertValidExecutionId(exec.execution_id);
  const dir = executionDir(res, exec.execution_id);
  // 安全：execution 目录必须落在 team_root 内（杜绝穿越）
  const teamNorm = norm(res.team_root);
  if (!norm(dir).startsWith(teamNorm + "/")) {
    throw new Error(
      `[myteam-execution-store] execution dir escapes team_root: ${dir}`
    );
  }
  assertNotDenied(dir, res);
  // 禁止覆盖已有 execution
  if (fs.existsSync(executionFile(res, exec.execution_id))) {
    throw new Error(
      `[myteam-execution-store] execution already exists: ${exec.execution_id}`
    );
  }
  for (const sub of ["runs", "checkpoints", "result"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  const createdExec: Execution = {
    ...exec,
    project: norm(exec.project || res.project_root),
    created: exec.created || new Date().toISOString(),
    status: (exec.status as ExecutionStatus) || "received",
    result: resultDir(res, exec.execution_id),
  };
  writeAtomic(executionFile(res, exec.execution_id), renderExecutionYaml(createdExec));
  return createdExec;
}

/** 读取 execution.yaml（不存在返回 null）。 */
export function load(res: Resolution, executionId: string): Execution | null {
  assertValidExecutionId(executionId);
  const file = executionFile(res, executionId);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const exeDir = executionDir(res, executionId);
  return {
    execution_id: getField(raw, "execution_id") || executionId,
    project: getField(raw, "project"),
    created: getField(raw, "created"),
    status: (getField(raw, "status") as ExecutionStatus) || "received",
    current_stage: getField(raw, "current_stage"),
    current_agent: getField(raw, "current_agent"),
    result: getField(raw, "result") || resultDir(res, executionId),
    plan_id: getField(raw, "plan_id") || undefined,
  };
}

/** 保存（只落盘；不推进状态、不校验状态转移合法）。 */
export function save(res: Resolution, exec: Execution): Execution {
  assertValidExecutionId(exec.execution_id);
  const dir = executionDir(res, exec.execution_id);
  assertNotDenied(dir, res);
  writeAtomic(executionFile(res, exec.execution_id), renderExecutionYaml(exec));
  return exec;
}

/** 列出项目下所有 execution 摘要（按 id 升序）。 */
export function list(res: Resolution): ExecutionSummary[] {
  const base = path.join(res.team_root, "runtime", "execution");
  if (!fs.existsSync(base)) return [];
  const out: ExecutionSummary[] = [];
  for (const entry of fs.readdirSync(base)) {
    if (!/^EX-\d+$/.test(entry)) continue;
    const e = load(res, entry);
    if (!e) continue;
    out.push({
      execution_id: e.execution_id,
      project: e.project,
      status: e.status,
      created: e.created,
      current_stage: e.current_stage,
    });
  }
  return out.sort((a, b) => a.execution_id.localeCompare(b.execution_id));
}

// ---------------------------------------------------------------------------
// 2. AgentRun：saveRun / loadRun / listRuns
// ---------------------------------------------------------------------------

/** 渲染 AgentRun YAML。 */
export function renderRunYaml(run: AgentRun): string {
  const L: string[] = [];
  L.push("# MyTeam Agent Run — schema_version 1");
  L.push("schema_version: 1");
  L.push(`execution_id: ${q(run.execution_id)}`);
  L.push(`agent_instance_id: ${q(run.agent_instance_id)}`);
  L.push(`status: ${q(run.status)}`);
  L.push(`input: ${q(run.input)}`);
  L.push(`output: ${q(run.output)}`);
  L.push(`started: ${q(run.started)}`);
  L.push(`completed: ${q(run.completed || "")}`);
  return L.join("\n") + "\n";
}

/** run 文件路径：<exe>/runs/<runId>.yaml */
export function runFile(res: Resolution, executionId: string, runId: string): string {
  return path.join(runsDir(res, executionId), `${runId}.yaml`);
}

/** 保存一次 AgentRun（只持久化，不启动）。 */
export function saveRun(res: Resolution, run: AgentRun, runId: string): string {
  assertValidExecutionId(run.execution_id);
  const dir = runsDir(res, run.execution_id);
  assertNotDenied(dir, res);
  const file = runFile(res, run.execution_id, runId);
  writeAtomic(file, renderRunYaml(run));
  return file;
}

/** 读取一次 AgentRun。 */
export function loadRun(res: Resolution, executionId: string, runId: string): AgentRun | null {
  const file = runFile(res, executionId, runId);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  return {
    execution_id: getField(raw, "execution_id"),
    agent_instance_id: getField(raw, "agent_instance_id"),
    status: getField(raw, "status"),
    input: getField(raw, "input"),
    output: getField(raw, "output"),
    started: getField(raw, "started"),
    completed: getField(raw, "completed") || undefined,
  };
}

/** 列出某 execution 的全部 run（按文件名升序）。 */
export function listRuns(res: Resolution, executionId: string): AgentRun[] {
  const dir = runsDir(res, executionId);
  if (!fs.existsSync(dir)) return [];
  const out: AgentRun[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith(".yaml")) continue;
    const run = loadRun(res, executionId, path.basename(entry, ".yaml"));
    if (run) out.push(run);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. HumanCheckpoint：saveCheckpoint / loadCheckpoint / listCheckpoints
// ---------------------------------------------------------------------------

/** 渲染 HumanCheckpoint YAML。 */
export function renderCheckpointYaml(cp: HumanCheckpoint): string {
  const L: string[] = [];
  L.push("# MyTeam Human Checkpoint — schema_version 1");
  L.push("schema_version: 1");
  L.push(`checkpoint_id: ${q(cp.checkpoint_id)}`);
  L.push(`type: ${q(cp.type)}`);
  L.push(`stage: ${q(cp.stage || "")}`);
  L.push(`message: ${q(cp.message)}`);
  L.push(`required_action: ${q(cp.required_action)}`);
  L.push(`resolution: ${q(cp.resolution || "")}`);
  L.push(`resolved: ${q(cp.resolved || "")}`);
  L.push(`resolved_at: ${q(cp.resolved_at || "")}`);
  L.push(`acknowledged: ${q(String(cp.acknowledged ?? false))}`);
  L.push("options:");
  if (cp.options.length === 0) L.push("  []");
  else for (const o of cp.options) L.push(`  - ${q(o)}`);
  return L.join("\n") + "\n";
}

/** checkpoint 文件路径：<exe>/checkpoints/<cpId>.yaml */
export function checkpointFile(res: Resolution, executionId: string, cpId: string): string {
  return path.join(checkpointsDir(res, executionId), `${cpId}.yaml`);
}

/** 保存一个 checkpoint。 */
export function saveCheckpoint(res: Resolution, cp: HumanCheckpoint, executionId: string): string {
  assertValidExecutionId(executionId);
  const dir = checkpointsDir(res, executionId);
  assertNotDenied(dir, res);
  const file = checkpointFile(res, executionId, cp.checkpoint_id);
  writeAtomic(file, renderCheckpointYaml(cp));
  return file;
}

/** 读取一个 checkpoint。 */
export function loadCheckpoint(res: Resolution, executionId: string, cpId: string): HumanCheckpoint | null {
  const file = checkpointFile(res, executionId, cpId);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  return {
    checkpoint_id: getField(raw, "checkpoint_id"),
    type: (getField(raw, "type") as HumanCheckpoint["type"]) || "continue",
    stage: getField(raw, "stage") || undefined,
    message: getField(raw, "message"),
    required_action: getField(raw, "required_action"),
    options: getList(raw, "options"),
    resolution: getField(raw, "resolution") || undefined,
    resolved: getField(raw, "resolved") || undefined,
    resolved_at: getField(raw, "resolved_at") || undefined,
    acknowledged: getField(raw, "acknowledged") === "true",
  };
}

/** 列出某 execution 的全部 checkpoint（按文件名升序）。 */
export function listCheckpoints(res: Resolution, executionId: string): HumanCheckpoint[] {
  const dir = checkpointsDir(res, executionId);
  if (!fs.existsSync(dir)) return [];
  const out: HumanCheckpoint[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith(".yaml")) continue;
    const cp = loadCheckpoint(res, executionId, path.basename(entry, ".yaml"));
    if (cp) out.push(cp);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Result Artifact：saveResultArtifact / loadResultArtifacts
// ---------------------------------------------------------------------------

/**
 * 把项目工作区里的一个文件登记为 result artifact：
 *   - 把源文件复制到 <exe>/result/<name>（允许子路径，如 docs/report.md）。
 *   - 若目标已在 result 目录内则直接使用（不复制）。
 * 返回 ResultArtifact 元数据。
 */
export function saveResultArtifact(
  res: Resolution,
  executionId: string,
  sourceAbsPath: string,
  name?: string
): ResultArtifact {
  assertValidExecutionId(executionId);
  const rDir = resultDir(res, executionId);
  assertNotDenied(rDir, res);
  const normSrc = norm(sourceAbsPath);
  const normResult = norm(rDir);
  // 源若已在 result 目录内 → 直接用
  let target: string;
  if (normSrc.startsWith(normResult + "/")) {
    target = sourceAbsPath;
  } else {
    // 否则复制到 result/<name>
    const rel = name || path.basename(sourceAbsPath);
    // 拒绝 rel 逃逸 result 目录
    const targetResolved = path.join(rDir, rel);
    if (!norm(targetResolved).startsWith(normResult + "/")) {
      throw new Error(
        `[myteam-execution-store] result artifact escapes result dir: ${rel}`
      );
    }
    fs.mkdirSync(path.dirname(targetResolved), { recursive: true });
    fs.copyFileSync(sourceAbsPath, targetResolved);
    target = targetResolved;
  }
  const st = fs.statSync(target);
  return {
    name: path.basename(target),
    path: target,
    size: st.size,
    modified: st.mtime.toISOString(),
  };
}

/** 列出某 execution 的全部 result artifact（递归 result 目录）。 */
export function loadResultArtifacts(res: Resolution, executionId: string): ResultArtifact[] {
  const dir = resultDir(res, executionId);
  if (!fs.existsSync(dir)) return [];
  const out: ResultArtifact[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else {
        const st = fs.statSync(p);
        out.push({
          name: path.relative(dir, p).replace(/\\/g, "/"),
          path: p,
          size: st.size,
          modified: st.mtime.toISOString(),
        });
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Execution 主清单渲染
// ---------------------------------------------------------------------------

export function renderExecutionYaml(exec: Execution): string {
  const L: string[] = [];
  L.push("# MyTeam Execution — schema_version 1");
  L.push("schema_version: 1");
  L.push(`execution_id: ${q(exec.execution_id)}`);
  L.push(`project: ${q(exec.project)}`);
  L.push(`created: ${q(exec.created)}`);
  L.push(`status: ${q(exec.status)}`);
  L.push(`current_stage: ${q(exec.current_stage)}`);
  L.push(`current_agent: ${q(exec.current_agent)}`);
  L.push(`result: ${q(exec.result)}`);
  L.push(`plan_id: ${q(exec.plan_id || "")}`);
  return renderYaml([], L);
}
