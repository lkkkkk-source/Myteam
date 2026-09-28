/**
 * MyTeam OpenCode Plugin — Bridge (bridge.ts) — v1.6.0
 * ---------------------------------------------------------------------------
 * Bridge Layer：OpenCode API  ↔  MyTeam Runtime。
 *
 * v1.6.0 变更（Workspace Binding）：
 *   - bridge() 不再接收硬编码 workspace 字符串，改为接收 Resolution。
 *   - 平台数据一律从 resolution.myteam_home 读取（loadPlatform）。
 *   - 项目根 / .team 存在于 resolution 中，随视图一并返回（供上层使用）。
 *   - 禁止把 MyTeamHome/.ai/context/ 当作项目 memory 继续读取。
 */

import type { LoadResult } from "./loader";
import { loadPlatform } from "./loader";
import type { Resolution } from "./workspace-resolver";

/** OpenCode 插件上下文（子集；对齐 @opencode-ai/plugin 的 ctx）。 */
export interface OpenCodeCtx {
  directory: string;
  worktree?: string;
  client?: unknown; // opencode SDK client（只用于 log）
  $?: unknown;      // Bun shell（不用于修改宿主）
}

export interface MyTeamRuntimeView {
  plugin: "myteam";
  version: string;
  platform_version: string;
  workspace: string;        // = myteam_home
  project_root: string;
  team_root: string;
  team_status: string;      // .team 初始化状态（created | ready）
  registry: LoadResult["registry"];
  deployment_status: string; // 读取自 adapter-state（只读）
  isolation: {
    host_config_write: false;
    copied_files: 0;
    reversible: true;
  };
}

/** 只读边界：任何写宿主的尝试都被拒绝。 */
export function guardHostWrite(targetPath: string): void {
  const forbidden = [".config/opencode/opencode.json", ".config/opencode/"];
  const norm = targetPath.replace(/\\/g, "/");
  for (const f of forbidden) {
    if (norm.includes(f)) {
      throw new Error(`[myteam-isolation] refused host write: ${targetPath}`);
    }
  }
}

/** 建立 OpenCode → MyTeam Runtime 的桥接（只读聚合）。 */
export function bridge(resolution: Resolution, teamStatus: string): MyTeamRuntimeView {
  const load = loadPlatform(resolution.myteam_home);

  return {
    plugin: "myteam",
    version: "1.6.0",
    platform_version: "v1.6",
    workspace: resolution.myteam_home,
    project_root: resolution.project_root,
    team_root: resolution.team_root,
    team_status: teamStatus,
    registry: load.registry,
    deployment_status: "draft",
    isolation: { host_config_write: false, copied_files: 0, reversible: true },
  };
}
