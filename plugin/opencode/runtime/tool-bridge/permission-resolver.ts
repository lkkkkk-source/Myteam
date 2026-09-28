/**
 * MyTeam OpenCode Plugin — Tool Bridge · Permission Resolver (permission-resolver.ts) — v1.6.3
 * ---------------------------------------------------------------------------
 * Phase 3 — Tool Bridge · Capability Binding Layer。
 *
 * 职责：根据 Agent 身份生成“agent 级能力权限模型”（read / edit / execute）。
 *   architect : read=true  edit=false execute=false
 *   developer : read=true  edit=true  execute=true
 *   tester    : read=true  edit=false execute=true
 *
 * 设计 §3：只生成权限模型，**不做任何执行检查**。
 * 它只是能力声明，真正落地仍需平台治理（permission-policy / executor / Approval）。
 *
 * 禁则：
 *   - 不调用工具 / 不写盘 / 不执行 checks —— 纯纯计算。
 *   - 不读任何运行时状态（只依赖 agent 名称/角色的静态特征）。
 * ---------------------------------------------------------------------------
 */

import type { AgentRuntimeInstance } from "../../agent-instance";

/** agent 级能力权限模型。 */
export interface AgentPermission {
  /** 可读（read / grep / glob / 查看类工具）。 */
  read: boolean;
  /** 可写（edit / write）。 */
  edit: boolean;
  /** 可执行（bash / execute / MCP 写类副作用工具）。 */
  execute: boolean;
}

/** 命名能力档案：按 agent 名称特征归类的权限模板。 */
export interface PermissionProfile {
  /** 匹配特征（agent 名含任一关键词即命中）。 */
  keywords: string[];
  profile: AgentPermission;
  /** 归类说明。 */
  note: string;
}

/**
 * 内置能力档案表（可扩展）。按顺序匹配，先命中者优先。
 * 关键词匹配：agent 名（小写）包含关键词，或 role 描述包含关键词。
 */
export const PERMISSION_PROFILES: PermissionProfile[] = [
  {
    keywords: ["developer", "implement", "coder", "engineer"],
    profile: { read: true, edit: true, execute: true },
    note: "开发者：读 / 写 / 执行全开放",
  },
  {
    keywords: ["tester", "debug", "verifier", "qa", "quality"],
    profile: { read: true, edit: false, execute: true },
    note: "测试 / 调试：可读 + 可执行（不直接改代码）",
  },
  {
    keywords: ["release", "publish", "git-manager", "deploy", "engops"],
    profile: { read: false, edit: false, execute: true },
    note: "发布 / 运维：只执行发布动作（受高级权限约束）",
  },
  {
    keywords: ["architect", "designer", "planner", "lead", "analyst", "review", "editor", "writer", "pm", "requirement", "discussion", "memory", "knowledge", "adr", "changelog", "health"],
    profile: { read: true, edit: false, execute: false },
    note: "架构 / 规划 / 审查 / 文档：只读（设计产出走文档，不直接改代码）",
  },
];

/** 默认档案：未知/新 agent 一律最小权限（只读，不任意开放写/执行）。 */
export const DEFAULT_PROFILE: AgentPermission = { read: true, edit: false, execute: false };

/**
 * 解析 agent 名称/角色的可读关键词集（小写、分词），用于档案匹配。
 */
export function resolveAgentPermission(inst: AgentRuntimeInstance): AgentPermission {
  const hay = `${inst.agent} ${inst.role}`.toLowerCase();
  for (const p of PERMISSION_PROFILES) {
    for (const kw of p.keywords) {
      if (hay.includes(kw.toLowerCase())) {
        return { ...p.profile };
      }
    }
  }
  return { ...DEFAULT_PROFILE };
}

/** 便捷：按 AgentRuntimeInstance 与（可选）显式覆盖生成权限模型。 */
export function permissionOf(
  inst: AgentRuntimeInstance,
  override?: Partial<AgentPermission>
): AgentPermission {
  const base = resolveAgentPermission(inst);
  return { ...base, ...(override ?? {}) };
}
