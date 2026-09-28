/**
 * MyTeam OpenCode Plugin — Tool Adapter · Security (security.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * 设计 §6（Security Boundary 确认）。
 *
 * 确认三类禁止路径 / 操作（与 v1.6.0 隔离契约 + guardHostWrite 一致）：
 *   1. MyTeam Home 写  — SecurityContext.deny_paths 含 Home；写 Home 域 → 拒绝
 *   2. ~/.config/opencode 写 — SecurityContext.host_config；写 host 配置 → 拒绝
 *   3. 越出安全域 — 路径 ∉ allowed_paths → 拒绝
 *
 * 本模块只做「路径黑名单 / 白名单判定」，不发起任何宿主调用、不写盘。
 * 宿主工具的写操作最终由 OpenCode 宿主执行；Adapter 只负责「下发前拦截」。
 *
 * 禁则：
 *   - 不修改宿主配置、不批量复制、不污染全局。
 *   - 卸载插件后宿主无残留。
 * ---------------------------------------------------------------------------
 */

import type { ToolInvocationRequest } from "../runner/types";

/** 宿主配置 / Home 路径黑名单（统一小写 + 斜杠规范化后匹配）。 */
const FORBIDDEN_HOST_DOMAINS = [
  ".config/opencode/opencode.json",
  ".config/opencode/",
];

/** 路径是否命中宿主配置 / Home 域。 */
export function isHostConfigWrite(targetPath: string): boolean {
  const norm = targetPath.replace(/\\/g, "/");
  for (const f of FORBIDDEN_HOST_DOMAINS) {
    if (norm.includes(f)) return true;
  }
  return false;
}

/** 路径是否在安全域内（∈ allowed_paths 且 ∉ deny_paths）。 */
export function pathInSecurityDomain(
  p: string,
  security: ToolInvocationRequest["security"]
): boolean {
  const norm = p.replace(/\\/g, "/");
  const inAllowed = security.allowed_paths.some((ap) => {
    const a = ap.replace(/\\/g, "/");
    return norm === a || norm.startsWith(a + "/");
  });
  const inDeny = security.deny_paths.some((dp) => {
    const d = dp.replace(/\\/g, "/");
    return norm === d || norm.startsWith(d + "/");
  });
  return inAllowed && !inDeny;
}

/**
 * 对请求的路径类参数做安全域检查。
 * 返回 null = 通过；string = 拒绝原因（→ assertion_error，不下发）。
 * 检查顺序：host-config 黑名单（最高优先）→ allowed_paths → deny_paths。
 */
export function checkSecurityDomain(
  req: ToolInvocationRequest
): string | null {
  for (const [k, v] of Object.entries(req.arguments)) {
    if (typeof v !== "string" || v.length === 0) continue;
    if (!/(?:read|write|edit|path)/i.test(k)) continue;

    // 1. 宿主配置黑名单（最严格，命中即拒绝）
    if (isHostConfigWrite(v)) {
      return `host config write blocked: ${k}=${v} (forbidden host domain)`;
    }

    // 2. 安全域检查
    if (!pathInSecurityDomain(v, req.security)) {
      return `path outside security domain: ${k}=${v}`;
    }
  }
  return null;
}
