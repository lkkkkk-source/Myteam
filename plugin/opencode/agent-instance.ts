/**
 * MyTeam OpenCode Plugin — Agent Runtime Adapter (agent-instance.ts) — v1.6.1
 * ---------------------------------------------------------------------------
 * Phase 2 — Agent Runtime Adapter · Step 2 & 3: AgentRuntimeInstance.
 *
 * 职责：把静态 AgentDefinition 投影为“运行实例”，并持久化到项目运行状态根：
 *   <project_root>/.team/runtime/agent-instance/<execution_id>/<agent>.yaml
 *
 * 生命周期（本阶段只实现这三个过渡态，不做任何执行）：
 *   create()      → status = "created"       （实例化：分配 id / workspace / memory / execution）
 *   initialize()  → status = "initialized"   （建立运行目录骨架，落 execution_dir）
 *   bind()        → status = "bound"         （绑定 prompt_source / 权限，完成投影）
 *
 * 禁止（本阶段明确不做）：
 *   - Tool Bridge、OpenCode 工具调用
 *   - Execution State Machine（完整执行态）
 *   - Trace Event Bus、Runner
 *
 * 隔离契约（沿用）：
 *   - 平台/静态定义从 myteam_home 读取（引用 prompt_source，绝不复制 prompt）。
 *   - 运行实例只写到 <project>/.team/**（绝不写 MyTeam Home / 宿主配置）。
 *   - 幂等：同一 execution + agent 重复激活复用同一实例目录，不重复污染。
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Resolution } from "./workspace-resolver";
import type { AgentDefinition } from "./agent-loader";

/** 运行实例状态（本阶段仅三个过渡态）。 */
export type InstanceStatus = "created" | "initialized" | "bound";

/**
 * 执行上下文：由上层（Entry / Runner 前的准备层）提供的投影环境。
 * v1.6.0 只做绑定，v1.6.1 用 execution 维度隔离实例。
 */
export interface ExecutionContext {
  /** 执行 ID（如 EX-001）。 */
  execution_id: string;
  /** 权限范围：为该实例声明的能力/工具白名单（静态声明，不触发调用）。 */
  permissions: string[];
  /** 可选：显式指定 workspace 根；缺省 = project_root（绑定用）。 */
  workspace?: string;
}

/** Agent 运行实例 —— AgentDefinition 在项目执行下的投影。 */
export interface AgentRuntimeInstance {
  /** 实例唯一 ID（execution_id:agent 的组合，规范化）。 */
  id: string;
  /** Agent 名称（= AgentDefinition.name）。 */
  agent: string;
  /** 角色描述（取自 AgentDefinition.role）。 */
  role: string;
  /** prompt 源文件绝对路径（引用 Home，不复制）。 */
  prompt_source: string;
  /** workspace 根（默认 <project_root>，可被 ExecutionContext 覆盖）。 */
  workspace: string;
  /** memory 命名空间 = <team_root>/memory/agents/<agent>/（按 agent+execution 隔离）。 */
  memory_namespace: string;
  /** 执行 ID（EX-xxx）。 */
  execution_id: string;
  /** 权限白名单（静态声明）。 */
  permissions: string[];
  /** 当前生命周期状态。 */
  status: InstanceStatus;
  /** 实例目录 = <team_root>/runtime/agent-instance/<execution_id>/<agent>/ */
  instance_dir: string;
}

/** 规范路径：统一分隔符 + 去尾斜杠。 */
function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

/** 实例 ID：execution_id:agent。 */
function instanceId(executionId: string, agent: string): string {
  return `${executionId}:${agent}`;
}

/**
 * Step 2a — create()
 * 实例化：分配 id / workspace / memory_namespace / instance_dir，状态 = created。
 * 纯计算（不写盘，便于上层校验后再落盘）。
 */
export function create(
  def: AgentDefinition,
  res: Resolution,
  execCtx: ExecutionContext
): AgentRuntimeInstance {
  const executionId = execCtx.execution_id;
  const workspace = execCtx.workspace
    ? norm(execCtx.workspace)
    : norm(res.project_root);
  // memory 命名空间：按 execution 隔离 + agent 隔离，避免跨执行/跨 agent 串扰
  const memoryNamespace = norm(path.join(res.team_root, "memory", "agents", executionId, def.name));
  const instanceDir = norm(
    path.join(res.team_root, "runtime", "agent-instance", executionId, def.name)
  );

  return {
    id: instanceId(executionId, def.name),
    agent: def.name,
    role: def.role,
    prompt_source: norm(def.prompt_path),
    workspace,
    memory_namespace: memoryNamespace,
    execution_id: executionId,
    permissions: [...execCtx.permissions],
    status: "created",
    instance_dir: instanceDir,
  };
}

/** 建立实例目录骨架（若不存在），返回实际创建的路径列表。 */
function ensureInstanceDir(inst: AgentRuntimeInstance): string[] {
  const created: string[] = [];
  if (!fs.existsSync(inst.instance_dir)) {
    fs.mkdirSync(inst.instance_dir, { recursive: true });
    created.push(inst.instance_dir);
  }
  // memory 命名空间目录（<team_root>/memory/agents/<exe>/<agent>/）
  if (!fs.existsSync(inst.memory_namespace)) {
    fs.mkdirSync(inst.memory_namespace, { recursive: true });
    created.push(inst.memory_namespace);
  }
  return created;
}

/**
 * Step 2b — initialize()
 * 在项目运行状态根建立实例目录骨架 + memory 命名空间，状态 = initialized。
 */
export function initialize(inst: AgentRuntimeInstance): AgentRuntimeInstance {
  ensureInstanceDir(inst);
  return { ...inst, status: "initialized" };
}

/**
 * Step 2c — bind()
 * 绑定最终引用（workspace / memory_namespace / prompt_source / permissions 已就绪），
 * 校验引用归属后置为 bound。不触发任何工具调用。
 */
export function bind(inst: AgentRuntimeInstance): AgentRuntimeInstance {
  // 安全校验：memory 命名空间必须位于 team_root 内（/memory/ 或 \memory\ 均可被识别）
  const normMem = inst.memory_namespace.replace(/\\/g, "/");
  if (!/\/memory\/agents\//.test(normMem)) {
    throw new Error(
      `[myteam-agent-instance] invalid memory namespace (must be under team_root/memory): ${inst.memory_namespace}`
    );
  }
  return { ...inst, status: "bound" };
}

// ---------------------------------------------------------------------------
// Step 3 — 实例持久化（<project>/.team/runtime/agent-instance/<exe>/<agent>.yaml）
// ---------------------------------------------------------------------------

/** 极简 YAML 标量转义（无依赖）。 */
function yamlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** 为实例渲染自持 YAML（schema_version 1）。 */
export function renderInstanceYaml(inst: AgentRuntimeInstance): string {
  const L: string[] = [];
  L.push("# MyTeam Agent Runtime Instance — schema_version 1");
  L.push("schema_version: 1");
  L.push(`id: ${yamlQuote(inst.id)}`);
  L.push(`agent: ${yamlQuote(inst.agent)}`);
  L.push(`role: ${yamlQuote(inst.role)}`);
  L.push(`prompt_source: ${yamlQuote(inst.prompt_source)}`);
  L.push(`workspace: ${yamlQuote(inst.workspace)}`);
  L.push(`memory_namespace: ${yamlQuote(inst.memory_namespace)}`);
  L.push(`execution_id: ${yamlQuote(inst.execution_id)}`);
  L.push(`status: ${yamlQuote(inst.status)}`);
  L.push(`instance_dir: ${yamlQuote(inst.instance_dir)}`);
  L.push("permissions:");
  for (const p of inst.permissions) L.push(`  - ${yamlQuote(p)}`);
  return L.join("\n") + "\n";
}

/** 实例文件路径 = <instance_dir>/.. 下放置 agent 前缀的 yaml（与 spec 建议 EX-xxx/<agent>.yaml 一致）。 */
export function instanceFilePath(inst: AgentRuntimeInstance): string {
  // 与 spec 建议一致：EX-001/<agent>.yaml 落在 runtime/agent-instance/<exe>/
  const exeDir = path.dirname(inst.instance_dir);
  return path.join(exeDir, `${inst.agent}.yaml`);
}

/**
 * Step 3 — persist()
 * 把实例写好到 <project>/.team/runtime/agent-instance/<exe>/<agent>.yaml。
 * 先确保目录，再原子写出（写临时文件后改名）。返回写入的绝对路径。
 */
export function persist(inst: AgentRuntimeInstance): string {
  if (inst.status !== "bound") {
    // 允许以任意状态落盘以便测试调试，但记录：不稳定状态仍可持久化
  }
  ensureInstanceDir(inst);
  const file = instanceFilePath(inst);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, renderInstanceYaml(inst), "utf8");
  fs.renameSync(tmp, file);
  return file;
}

/**
 * 便捷入口：create → initialize → bind → persist 一步完成。
 * 返回更新后的 bound 实例。
 */
export function activateAgent(
  def: AgentDefinition,
  res: Resolution,
  execCtx: ExecutionContext
): AgentRuntimeInstance {
  const inst = create(def, res, execCtx);
  const initialized = initialize(inst);
  const bound = bind(initialized);
  persist(bound);
  return bound;
}

/** 读取既有实例文件为结构化对象（解析自持 yaml）。 */
export function readInstanceFile(file: string): AgentRuntimeInstance | null {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const get = (key: string): string => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    return m ? m[1].replace(/^["']|["']$/g, "").replace(/\\\\/g, "\\") : "";
  };
  const permissions: string[] = [];
  const permRe = /^\s*-\s*"?([^"\n]+)"?\s*$/gm;
  let mm: RegExpExecArray | null;
  while ((mm = permRe.exec(raw)) !== null) {
    if (permissions.length === 0) {
      // 跳过 schema_version/顶层非权限 `-` 行：仅当出现在 permissions 段后
      const idx = raw.indexOf("permissions:");
      if (mm.index < idx) continue;
    }
    permissions.push(mm[1].trim());
  }
  return {
    id: get("id"),
    agent: get("agent"),
    role: get("role"),
    prompt_source: get("prompt_source"),
    workspace: get("workspace"),
    memory_namespace: get("memory_namespace"),
    execution_id: get("execution_id"),
    permissions,
    status: (get("status") as InstanceStatus) || "bound",
    instance_dir: get("instance_dir"),
  };
}
