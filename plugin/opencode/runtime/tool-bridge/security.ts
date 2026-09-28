/**
 * MyTeam OpenCode Plugin — Tool Bridge · Security Context (security.ts) — v1.6.3
 * ---------------------------------------------------------------------------
 * Phase 3 — Tool Bridge · Capability Binding Layer。
 *
 * 职责：生成 SecurityContext —— 允许 / 拒绝 路径域。
 *   只**生成 / 登记**规则；本阶段不执行任何拦截（执行层在后续阶段接入）。
 *
 *   allowed_paths: [project_root, team_root]      ← 允许读 / 写 / 执行
 *   deny_paths:    [myteam_home, host_config]     ← 一律只读 / 禁写
 *
 * 不变量（沿用 v1.0.1 / bridge.ts guardHostWrite）：
 *   - MyTeam Home = Source of Truth，禁写。
 *   - host config（~/.config/opencode）禁写。
 * ---------------------------------------------------------------------------
 */

import * as os from "node:os";
import * as path from "node:path";
import type { Resolution } from "../../workspace-resolver";
import type { SecurityContext } from "./context";

/** 规范路径：统一分隔符 + 去尾斜杠。 */
function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

/** 去重（保持顺序）。 */
function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const k = norm(a);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** 宿主配置目录（~/.config/opencode），沿 guardHostWrite 的 forbidden 风格。 */
export function hostConfigDir(): string {
  return norm(path.join(os.homedir(), ".config", "opencode"));
}

/**
 * 由 Resolution 生成安全上下文。
 * allowed 优先于 deny；若 project_root 恰好与 myteam_home 相交则始终把 Home 判为 deny。
 */
export function buildSecurity(res: Resolution): SecurityContext {
  const projectRoot = norm(res.project_root);
  const teamRoot = norm(res.team_root);
  const myteamHome = norm(res.myteam_home);
  const hostConf = hostConfigDir();

  // 保护性：project_root 若位于 Home 内依旧允许项目域，但 Home 本体仍禁写。
  return {
    allowed_paths: dedupe([projectRoot, teamRoot]),
    deny_paths: dedupe([myteamHome, hostConf]),
    host_config: hostConf,
    myteam_home: myteamHome,
  };
}

/** 便捷判断：某绝对路径是否落在 deny 域（供未来执行层用；本阶段不调用）。 */
export function isDenied(absPath: string, sec: SecurityContext): boolean {
  const p = norm(absPath);
  for (const d of sec.deny_paths) {
    if (p === d || p.startsWith(d + "/")) return true;
  }
  return false;
}
