/**
 * MyTeam OpenCode Plugin — Workspace Resolver (workspace-resolver.ts) — v1.6.0
 * ---------------------------------------------------------------------------
 * Phase 1 — Workspace Binding Architecture.
 *
 * 职责：把 OpenCode 的【当前工作目录】解析为 MyTeam 的全局/项目分层：
 *
 *   myteam_home   : MyTeam 平台根（agents / prompts / teams / roles / router /
 *                   policies / runtime core —— 全平台资产，只读）。
 *   project_root  : 用户项目根（= OpenCode ctx.directory，经 realpath 规范化）。
 *   team_root     : 项目运行状态根（= <project_root>/.team）。
 *
 * 本阶段严格范围：
 *   - 只做 Binding 解析 + .team 初始化基础。
 *   - 不实现 Agent Runtime / Tool Bridge / Execution State / Trace。
 *   - 不改变 Router / 不改变 Agent 定义。
 *   - 禁止把 Agent 复制到项目目录（.team/agents 永不创建）。
 * ---------------------------------------------------------------------------
 * 隔离契约（沿用）：
 *   - 平台数据从 myteam_home 读取（不写）。
 *   - 项目运行数据从 team_root 读取（仅 .team/** 可初始化）。
 *   - 禁止把 MyTeamHome/.ai/context/ 当作项目 memory 继续读取。
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** OpenCode 插件上下文（子集；对齐 @opencode-ai/plugin 的 ctx）。 */
export interface OpenCodeCtx {
  directory: string;
  worktree?: string;
  client?: unknown; // 本模块不使用 client，仅占位保持签名一致
  $?: unknown;
}

/** 解析结果：全局 / 项目 / 运行状态 三根。 */
export interface Resolution {
  /** MyTeam 平台根（Source of Truth）。 */
  myteam_home: string;
  /** 用户项目根（= OpenCode cwd, 规范化）。 */
  project_root: string;
  /** 项目运行状态根 = <project_root>/.team。 */
  team_root: string;
}

/** 解析异常基类。 */
export class MyTeamResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MyTeamResolutionError";
  }
}

/** 项目根 == MyTeam Home，或位于 Home 内部 —— 必须拒绝。 */
export class HomeAsProjectError extends MyTeamResolutionError {
  readonly project_root: string;
  readonly myteam_home: string;
  constructor(project_root: string, myteam_home: string, reason: string) {
    super(
      `[myteam-resolution] refuse to treat MyTeam Home as a project: ${reason} ` +
        `(project_root=${project_root}, myteam_home=${myteam_home})`
    );
    this.name = "HomeAsProjectError";
    this.project_root = project_root;
    this.myteam_home = myteam_home;
  }
}

// ---------------------------------------------------------------------------
// myteam_home 解析：从 myteam-plugin.yaml 的 workspace: 字段读取，不做硬编码。
// 该文件与本模块同目录（plugin/opencode/myteam-plugin.yaml）。
// ---------------------------------------------------------------------------

/** 定位 myteam-plugin.yaml（与本模块同目录）。 */
function pluginYamlPath(): string {
  return path.join(import.meta.dirname, "myteam-plugin.yaml");
}

function trimQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

/** 极简读取 `workspace:` 字段（无 YAML 依赖）。 */
export function readMyTeamHome(): string {
  const yaml = pluginYamlPath();
  if (!fs.existsSync(yaml)) {
    throw new MyTeamResolutionError(`[myteam-resolution] myteam-plugin.yaml not found near plugin: ${yaml}`);
  }
  const raw = fs.readFileSync(yaml, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*workspace\s*:\s*["']?([^"'\s#]+)["']?\s*$/);
    if (m) {
      return path.resolve(trimQuotes(m[1]));
    }
  }
  throw new MyTeamResolutionError(`[myteam-resolution] workspace: field not found in ${yaml}`);
}

/** 判断 child 是否等于 parent，或位于 parent 内部（基于规范化路径）。 */
export function isInsideOrEqual(parent: string, child: string): boolean {
  const p = path.resolve(parent).replace(/\\/g, "/").replace(/\/+$/, "");
  const c = path.resolve(child).replace(/\\/g, "/").replace(/\/+$/, "");
  return c === p || c.startsWith(p + "/");
}

// ---------------------------------------------------------------------------
// 核心解析：resolveWorkspace(ctx) -> Resolution
// ---------------------------------------------------------------------------

/**
 * 解析 OpenCode 当前 workspace 为 MyTeam 的分层 Resolution。
 *
 * 规则：
 *   - myteam_home  ← myteam-plugin.yaml workspace
 *   - project_root ← ctx.directory（path.resolve + fs.realpathSync 规范化）
 *   - team_root    ← path.join(project_root, '.team')
 *
 * 安全：
 *   若 project_root == myteam_home，或 project_root 位于 myteam_home 内部
 *   （如用���在 MyTeam 仓库内启动 OpenCode），必须拒绝（HomeAsProjectError）。
 */
export function resolveWorkspace(ctx: OpenCodeCtx): Resolution {
  const myteam_home = readMyTeamHome();

  if (!ctx || typeof ctx.directory !== "string" || ctx.directory.trim() === "") {
    throw new MyTeamResolutionError(
      "[myteam-resolution] OpenCode ctx.directory is missing/empty; cannot bind a project workspace"
    );
  }

  // 项目根：resolve + realpath（规范化真实路径 / 符号链接 / 大小写）
  const candidate = path.resolve(ctx.directory);
  let project_root: string;
  if (fs.existsSync(candidate)) {
    try {
      project_root = fs.realpathSync(candidate);
    } catch {
      project_root = candidate;
    }
  } else {
    project_root = candidate;
  }

  // 安全：拒绝把 MyTeam Home 或其内部当作项目。
  if (isInsideOrEqual(myteam_home, project_root)) {
    throw new HomeAsProjectError(project_root, myteam_home, "project_root is inside or equal to myteam_home");
  }

  const team_root = path.join(project_root, ".team");

  return { myteam_home, project_root, team_root };
}

// ---------------------------------------------------------------------------
// .team 初始化基础：ensureTeamRoot(res)
// ---------------------------------------------------------------------------

export interface TeamInitResult {
  initialized: boolean; // false = 已存在（幂等），true = 本次新建了内容
  team_root: string;
  created: string[]; // 本次实际创建的路径
  context: string; // context.yaml 绝对路径
  status: string; // "created" | "ready"
}

/** context.yaml 内容（schema_version 1）。 */
export interface TeamContext {
  schema_version: number;
  project: { root: string; name: string };
  myteam: { version: string; home: string };
  runtime: { created: string; status: string };
}

const TEAM_SUBDIRS = ["memory", "execution", "trace", "collaboration"] as const;

/** 项目名：取目录 basename。 */
function projectName(projectRoot: string): string {
  const norm = projectRoot.replace(/[\\/]+$/, "");
  return path.basename(norm) || "project";
}

/** 极简 YAML 渲染（无依赖；仅用于本项目自持的 context.yaml）。 */
function renderYaml(ctx: TeamContext): string {
  const L: string[] = [];
  L.push("# MyTeam Project Runtime Context — schema_version 1");
  L.push(`schema_version: ${ctx.schema_version}`);
  L.push("project:");
  L.push(`  root: "${ctx.project.root.replace(/\\/g, "/")}"`);
  L.push(`  name: "${ctx.project.name}"`);
  L.push("myteam:");
  L.push(`  version: "${ctx.myteam.version}"`);
  L.push(`  home: "${ctx.myteam.home.replace(/\\/g, "/")}"`);
  L.push("runtime:");
  L.push(`  created: "${ctx.runtime.created}"`);
  L.push(`  status: "${ctx.runtime.status}"`);
  return L.join("\n") + "\n";
}

/** 读取插件版本：优先 myteam-plugin.yaml 的 plugin_version，失败回退。 */
function readMyTeamVersion(): string {
  try {
    const yaml = pluginYamlPath();
    if (fs.existsSync(yaml)) {
      const raw = fs.readFileSync(yaml, "utf8");
      const m = raw.match(/^\s*plugin_version\s*:\s*["']?([^"'\s#]+)["']?\s*$/m);
      if (m) return m[1];
    }
  } catch {
    /* ignore */
  }
  return "1.6.0";
}

/**
 * lazy 初始化 .team/。首次调用为项目创建：
 *   context.yaml + memory/ + execution/ + trace/ + collaboration/
 * 永不创建 agents/（Agent 定义永远属于 MyTeam Home，禁止复制）。
 *
 * 幂等：已存在则直接返回 initialized=false，不报错、不覆盖 context.yaml。
 */
export function ensureTeamRoot(res: Resolution): TeamInitResult {
  const tRoot = res.team_root;
  const createdNow: string[] = [];
  let isNew = false;

  if (!fs.existsSync(tRoot)) {
    fs.mkdirSync(tRoot, { recursive: true });
    createdNow.push(tRoot);
    isNew = true;
  }
  for (const sub of TEAM_SUBDIRS) {
    const p = path.join(tRoot, sub);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      createdNow.push(p);
    }
  }

  const contextPath = path.join(tRoot, "context.yaml");
  if (!fs.existsSync(contextPath)) {
    const ctx: TeamContext = {
      schema_version: 1,
      project: { root: res.project_root, name: projectName(res.project_root) },
      myteam: { version: readMyTeamVersion(), home: res.myteam_home },
      runtime: { created: new Date().toISOString(), status: "active" },
    };
    fs.writeFileSync(contextPath, renderYaml(ctx), "utf8");
    createdNow.push(contextPath);
  }

  return {
    initialized: isNew || createdNow.length > 0,
    team_root: tRoot,
    created: createdNow,
    context: contextPath,
    status: isNew ? "created" : "ready",
  };
}
