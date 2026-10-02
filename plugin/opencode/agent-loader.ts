/**
 * MyTeam OpenCode Plugin — Agent Definition Loader (agent-loader.ts) — v1.6.1
 * ---------------------------------------------------------------------------
 * Phase 2 — Agent Runtime Adapter · Step 1: AgentDefinition.
 *
 * 职责：把 MyTeam Home 下的静态 Agent 定义（opencode-global/prompts/** 与 agents/**
 * 等实际架构根下的 *.md）读取并解析为结构化 AgentDefinition。**只读** ——
 * 绝不修改任何现有 markdown。
 *
 * AgentDefinition = 静态定义（属于 MyTeam Home，Source of Truth）。
 * 它与 v1.6.0 的 Resolution 一起，在 agent-instance.ts 中投影为运行实例。
 *
 * 隔离契约（沿用）：
 *   - 只从 myteam_home 读取 prompt，不写 Home。
 *   - 不复制 prompt 到项目/宿主（改为引用 prompt_source 路径）。
 *   - 不改动任何 prompt 源文件内容。
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * 从 markdown prompt 解析出的静态 Agent 定义。
 */
export interface AgentDefinition {
  /** Agent 名称（= prompt 文件名去 .md，或首个 `# ` 标题）。 */
  name: string;
  /** 所属团队（= prompt 根下父目录名，如 java / advisory）。 */
  team: string;
  /** 角色（= ## Role 段首行；未命中则为 ""）。 */
  role: string;
  /** 职责摘要（= ## Responsibility 段，取前若干行文本）。 */
  responsibility: string[];
  /** 工作流（= ## Workflow 段，按要点抽取）。 */
  workflow: string[];
  /** 相关技能（= ## Related Skills 行内反引号项）。 */
  skills: string[];
  /** capability 引用（= ## Capabilities 行内反引号项）；可为空数组。 */
  capability_refs: string[];
  /** 绝对路径的 prompt 源文件（用于 prompt_source，不复制）。 */
  prompt_path: string;
  /** 相对 source 的 prompt 路径（标识）。 */
  prompt_rel: string;
}

/** 规范路径：统一分隔符 + 去尾斜杠。 */
function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

/** 从一行提取所有反引号包裹的标识符。 */
function backtickTokens(line: string): string[] {
  const out: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return out;
}

/**
 * 按 `## Section` 切分 markdown，返回 段名 -> 段体行数组。
 */
function sections(lines: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let cur: string | null = null;
  for (const ln of lines) {
    const h = ln.match(/^##+\s+(.+?)\s*$/);
    if (h) {
      cur = h[1].trim();
      map.set(cur, []);
      continue;
    }
    if (cur !== null) {
      map.get(cur)!.push(ln);
    }
  }
  return map;
}

/** 从段体提取“要点行”（非空、非代码块/引用/纯装饰）。 */
function bulletLines(body: string[]): string[] {
  const out: string[] = [];
  for (const ln of body) {
    const t = ln.trim();
    if (!t) continue;
    if (/^```/.test(t)) continue;
    if (/^~~~/.test(t)) continue;
    out.push(t.replace(/^[\-\*\d\.\)]+\s+/, "").trim());
  }
  return out;
}

/** 清理行首波浪号/backtick 装饰，保留可读文本。 */
function cleanText(t: string): string {
  return t.replace(/^[`~>\-\s]+/, "").replace(/[`~]+/g, "").trim();
}

/**
 * 解析单个 markdown prompt 文件为 AgentDefinition。
 * 纯正则解析，不依赖 YAML/外部库；不写入任何文件。
 * @param home 可选 MyTeam Home；提供时 prompt_rel 以 Home 为基准计算（反映真实存放位置）。
 */
export function parseAgentPrompt(absPath: string, home?: string): AgentDefinition {
  const raw = fs.readFileSync(absPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const teamDir = path.basename(path.dirname(absPath));

  // name：首选首个 `# `（顶层标题），否则用文件名
  let name = "";
  for (const ln of lines) {
    const h = ln.match(/^#\s+(.+?)\s*$/);
    if (h) {
      name = h[1].trim().split(/\s+/)[0];
      break;
    }
  }
  if (!name) name = path.basename(absPath, ".md");

  return finalize(name, teamDir, sections(lines), absPath, home);
}

/** 组装最终 AgentDefinition（独立小函数，解析集中在段落层面）。 */
function finalize(
  name: string,
  teamDir: string,
  sec: Map<string, string[]>,
  absPath: string,
  home?: string
): AgentDefinition {
  const props = (key: string) => sec.get(key) ?? [];

  // role：## Role 段首行（经清洗后的可读角色描述），取首句
  const roleLines = props("Role");
  let role = "";
  for (const ln of roleLines) {
    const t = cleanText(ln);
    if (!t) continue;
    const firstSentence = t.split(/[。.!！?\n]/)[0].trim();
    role = firstSentence || "";
    break;
  }

  const clean = (arr: string[]) => arr.map(cleanText).filter((x) => x.length > 0);
  const responsibility = clean(bulletLines(props("Responsibility"))).slice(0, 8);
  const workflow = clean(bulletLines(props("Workflow"))).slice(0, 12);

  // skills：## Related Skills / ## Skills 行内反引号项
  // capability_refs：## Capabilities 行内反引号项
  const skills = new Set<string>();
  const capability_refs = new Set<string>();
  for (const ln of [...props("Related Skills"), ...props("Skills")]) {
    for (const t of backtickTokens(ln)) skills.add(t);
  }
  for (const ln of props("Capabilities")) {
    for (const t of backtickTokens(ln)) capability_refs.add(t);
  }

  const normHome = home ? norm(home) : "";
  const absNorm = norm(absPath);

  return {
    name,
    team: teamDir,
    role,
    responsibility,
    workflow,
    skills: [...skills],
    capability_refs: [...capability_refs],
    prompt_path: absNorm,
    prompt_rel: normHome
      ? segRel(absNorm, normHome)
      : path.posix.join("source/prompts", teamDir, path.basename(absPath)),
  };
}

/** 相对 Home 的路径（保持原有分隔符归一，避免 posix/win32 混用）。 */
function segRel(absNorm: string, homeNorm: string): string {
  if (absNorm === homeNorm) return ".";
  if (absNorm.startsWith(homeNorm + "/")) return absNorm.slice(homeNorm.length + 1);
  return absNorm;
}

/**
 * 递归收集某个 promptsRoot 下所有 prompt 文件并解析。
 * @param promptsRoot prompt 根目录（可为 <home>/opencode-global/prompts · <home>/agents 等）
 * @param home 可选 MyTeam Home；提供时 prompt_rel 以 Home 为基准计算。
 */
export function loadAgentDefinitions(promptsRoot: string, home?: string): AgentDefinition[] {
  if (!fs.existsSync(promptsRoot)) return [];
  const out: AgentDefinition[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        out.push(parseAgentPrompt(p, home));
      }
    }
  };
  walk(promptsRoot);
  return out;
}

/**
 * MyTeam Home 下实际架构的 prompt 根候选（按优先顺序）：
 *   1. opencode-global/prompts —— 全局 prompt 库（全量 30）
 *   2. agents                    —— Agent 定义目录（子集，prompt 收敛集）
 *   3. source/prompts            —— v1.6.x 旧布局（兼容回退，可能存在也可能不存在）
 *
 * 全部为 Home 平台资产，只读引用，绝不复制。
 */
export function promptRootCandidates(home: string): string[] {
  return [
    path.join(home, "opencode-global", "prompts"),
    path.join(home, "agents"),
    path.join(home, "source", "prompts"),
  ];
}

/**
 * 从 MyTeam Home 加载全部 Agent 定义：
 * 遍历所有存在的实际架构根并合并，同名去重（先命中者优先）。
 * 只读；绝不写 Home。prompt_rel 以 Home 为基准计算，反映真实存放位置。
 */
export function loadAgentDefinitionsFromHome(home: string): AgentDefinition[] {
  const seen = new Set<string>();
  const out: AgentDefinition[] = [];
  for (const root of promptRootCandidates(home)) {
    if (!fs.existsSync(root)) continue;
    for (const def of loadAgentDefinitions(root, home)) {
      if (!seen.has(def.name)) {
        seen.add(def.name);
        out.push(def);
      }
    }
  }
  return out;
}

/** 便捷：按名称查找单个 AgentDefinition。 */
export function findAgentDefinition(
  defs: AgentDefinition[],
  name: string
): AgentDefinition | undefined {
  return defs.find((d) => d.name === name);
}
