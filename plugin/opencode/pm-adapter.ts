/**
 * MyTeam OpenCode Plugin — PM Entry Adapter (pm-adapter.ts) — v1.5.1
 * ---------------------------------------------------------------------------
 * OpenCode Entry Adapter Layer：把 OpenCode 的【单一入口 "MyTeam"】桥接到
 * MyTeam 既有的用户唯一入口 Agent —— project-manager-agent（PM，自 v0.6 起兼任 Router）。
 *
 *   OpenCode (Host)
 *      │  单一可见入口: "MyTeam"
 *      ▼
 *   pm-adapter (this)            ← 仅表面转发，不做决策
 *      ▼
 *   project-manager-agent (既有 PM = 用户唯一入口 + Router)
 *      ▼
 *   Router → Team → Role → Agent (全部内部，OpenCode 不可见)
 *
 * 硬性边界（强制，继承 v1.0.1 隔离）：
 *   - 复用既有 PM，不新增 Agent、不修改任何 prompt / routing-rules / team-registry；
 *   - Adapter 只转发用户请求给 PM，不自己做路由决策、不选最终 Agent、不执行；
 *   - 不向 OpenCode 表面枚举 30 个 Agent（只暴露 1 个 "MyTeam" 入口）；
 *   - 不写 ~/.config/opencode（host_config_write=false），不复制文件（copy_files=false）；
 *   - 不 runtime 反向改 source（source_of_truth=true）。
 */

import { guardHostWrite } from "./bridge";
import { loadPlatform } from "./loader";
import type { Resolution } from "./workspace-resolver";

/** MyTeam 的用户唯一入口 Agent（既有，非新增）。 */
export const PM_ENTRY_AGENT = "project-manager-agent";

/** OpenCode 对外可见的单一入口名。 */
export const OPENCODE_ENTRY = "MyTeam";

/**
 * 内部链路（结构描述，非枚举）：
 * OpenCode 只看到 "MyTeam"；其后全部内部，不暴露 30 个 Agent。
 */
export const ENTRY_CHAIN = [
  "MyTeam",                 // OpenCode 可见入口
  "project-manager-agent",  // 既有 PM = 用户唯一入口 + Router
  "Router",                 // PM 内置能力（不新增 Agent、规则不动）
  "Team",                   // team-registry / organization（内部）
  "Role",                   // organization role binding（内部，v1.4.3）
  "Agent",                  // 30 Agents（内部，不暴露）
] as const;

export interface EntryRequest {
  /** OpenCode 用户输入（自然语言任务）。 */
  request: string;
}

export interface EntryResult {
  entry: typeof OPENCODE_ENTRY;   // "MyTeam"
  routed_to: typeof PM_ENTRY_AGENT; // "project-manager-agent"
  chain: readonly string[];
  request: string;
  /** 表面适配器不做决策/不执行/不选最终 Agent。 */
  performs_routing: false;
  selects_final_agent: false;
  executes: false;
  exposes_agents: false;
  isolation: { host_config_write: false; copy_files: false; source_of_truth: true };
  /** v1.6.0：Workspace Binding 解析结果（全局/项目/运行状态三根）。 */
  binding: { myteam_home: string; project_root: string; team_root: string };
  note: string;
}

/**
 * Adapter 侧硬边界：禁止向 OpenCode 表面枚举 Agent。
 * 任何"列出 30 个 Agent 供 OpenCode 选择"的调用都被拒绝。
 */
export function refuseAgentEnumeration(source: string): never {
  throw new Error(
    `[myteam-entry] must not expose 30 agents to OpenCode (source=${source}); only single entry "MyTeam" → PM`
  );
}

/**
 * 校验 PM 入口存在于既有 30 Agent 中（只读，不修改，不枚举给宿主）。
 * 返回布尔，仅供 adapter 自检；不把 agent 列表暴露给 OpenCode 表面。
 */
export function verifyPmEntry(workspace: string): boolean {
  const load = loadPlatform(workspace);
  // 只在 adapter 内部核对，不向外暴露列表
  return load.registry.agents.includes(PM_ENTRY_AGENT);
}

/** v1.6.0：基于 Resolution 的平台入口核对（平台数据读取自 myteam_home）。 */
export function verifyPmEntryRes(resolution: Resolution): boolean {
  return verifyPmEntry(resolution.myteam_home);
}

/**
 * 处理来自 OpenCode 单一入口 "MyTeam" 的请求：
 * 仅【转发】给既有 project-manager-agent（PM 自行完成 Router→Team→Role→Agent）。
 * Adapter 不做路由决策、不选最终 Agent、不执行、不写宿主。
 */
export function handleEntryRequest(req: EntryRequest, resolution: Resolution): EntryResult {
  // 继承隔离：任何试图写宿主的路径都被拒绝（此处仅防御性调用）
  guardHostWrite(`${resolution.myteam_home}/.ai/context/current-task.yaml`);

  return {
    entry: OPENCODE_ENTRY,
    routed_to: PM_ENTRY_AGENT,
    chain: ENTRY_CHAIN,
    request: req.request,
    performs_routing: false,
    selects_final_agent: false,
    executes: false,
    exposes_agents: false,
    isolation: { host_config_write: false, copy_files: false, source_of_truth: true },
    binding: {
      myteam_home: resolution.myteam_home,
      project_root: resolution.project_root,
      team_root: resolution.team_root,
    },
    note:
      'OpenCode single entry "MyTeam" delegates to existing project-manager-agent; ' +
      "PM performs Router→Team→Role→Agent internally. Adapter does not route/select/execute, " +
      "does not expose 30 agents, does not modify host or source.",
  };
}
