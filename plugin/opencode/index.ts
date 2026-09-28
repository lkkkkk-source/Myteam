/**
 * MyTeam OpenCode Plugin — Entry (index.ts) — v1.0.1
 * ---------------------------------------------------------------------------
 * OpenCode Plugin 入口。将 MyTeam 封装为 Independent Plugin：
 *
 *   OpenCode (Host Runtime)
 *      ↓
 *   MyTeam Plugin (this)
 *      ↓
 *   MyTeam Platform Core (source/ platform/ registry/ runtime/, read-only)
 *
 * 负责：初始化 MyTeam → 加载 registry → 加载 agents → 初始化 runtime（只读聚合）。
 *
 * 隔离契约（强制）：
 *   - 不修改 OpenCode 核心；不批量复制到 ~/.config/opencode；不污染全局环境；
 *   - 不覆盖 opencode.json；不 runtime 反向改 source；不自动执行/部署。
 *   - 卸载插件后 OpenCode 恢复原状（无残留：本插件只读取，不写宿主）。
 */

import { bridge, guardHostWrite, type OpenCodeCtx, type MyTeamRuntimeView } from "./bridge";
import { loadPlatform } from "./loader";
import { admitExecution, refuseActionGeneration, type ExecutionRequestView } from "./execution-bridge";
import { handleEntryRequest, PM_ENTRY_AGENT, OPENCODE_ENTRY, ENTRY_CHAIN, type EntryRequest } from "./pm-adapter";
import {
  resolveWorkspace,
  ensureTeamRoot,
  type Resolution,
} from "./workspace-resolver";

/**
 * OpenCode Plugin 函数。返回 hooks 对象。
 * 兼容 @opencode-ai/plugin 的 Plugin 签名：async (ctx) => hooks。
 *
 * v1.6.0 Workspace Binding：
 *   启动即解析 OpenCode 当前目录 → Resolution（myteam_home / project_root / team_root）。
 *   platform/ loader/ pm-adapter/ 统一接收 Resolution；不再使用硬编码 workspace。
 */
export const MyTeamPlugin = async (ctx: OpenCodeCtx) => {
  // 1) 解析 Workspace Binding（拒绝把 MyTeam Home 当作项目）
  const resolution: Resolution = resolveWorkspace(ctx as OpenCodeCtx);

  // 2) .team 初始化基础（lazy、幂等；只在项目内创建，永不创建 agents）
  const team = ensureTeamRoot(resolution);

  // 3) 加载平台 registry + agents（只读，自 myteam_home）
  const load = loadPlatform(resolution.myteam_home);

  // 4) 初始化 runtime（只读聚合视图，绑定项目/运行状态根）
  const view: MyTeamRuntimeView = bridge(resolution, team.status);

  // 结构化日志（用 client.app.log，不用 console；不写宿主配置）
  const anyClient = ctx.client as { app?: { log?: (x: unknown) => Promise<void> } } | undefined;
  if (anyClient?.app?.log) {
    await anyClient.app.log({
      body: {
        service: "myteam-plugin",
        level: load.ok ? "info" : "warn",
        message: "MyTeam plugin initialized (read-only, isolated)",
        extra: {
          version: "1.6.0",
          entry: OPENCODE_ENTRY,          // v1.5.1: OpenCode 单一可见入口 = "MyTeam"
          routed_to: PM_ENTRY_AGENT,       // 转发给既有 project-manager-agent（不新增 Agent）
          chain: ENTRY_CHAIN,              // MyTeam → PM → Router → Team → Role → Agent
          agents: load.registry.agents.length,
          copiedFiles: load.copiedFiles, // 0
          errors: load.errors,
          // v1.6.0 Workspace Binding
          project_root: resolution.project_root,
          team_root: resolution.team_root,
          team_status: team.status,
        },
      },
    });
  }

  return {
    // 暴露只读状态查询工具（不修改宿主 / 不执行）
    tool: {
      // v1.5.1 OpenCode Entry Adapter：OpenCode 只看到【单一入口 "MyTeam"】。
      // 该入口把用户请求转发给既有 project-manager-agent（PM = 用户唯一入口 + Router）。
      // 不新增 Agent、不暴露 30 个 Agent、不做路由决策、不选最终 Agent、不执行。
      "myteam": {
        description:
          'MyTeam — single OpenCode entry. Delegates the user request to the existing ' +
          'project-manager-agent (PM = sole entry + Router), which internally runs ' +
          'Router→Team→Role→Agent. Never exposes the 30 agents, never selects a final agent, never executes.',
        args: { request: { type: "string", description: "User task/request for MyTeam." } },
        async execute(args: { request?: string }) {
          const result = handleEntryRequest({ request: args?.request ?? "" } as EntryRequest, resolution);
          return JSON.stringify(result, null, 2);
        },
      },
      "myteam.status": {
        description: "Read-only MyTeam platform status (agents/registry/deployment). Never modifies host.",
        args: {},
        async execute() {
          return JSON.stringify(view, null, 2);
        },
      },
      // v1.2 Execution Bridge：只对【已批准 + 已授权】的 Execution Request 做准入判断
      // （真实执行由受治理引擎处理；Plugin 不生成 Action、不绕过 Governance）。
      "myteam.execution.admit": {
        description: "Gate-check a governed Execution Request (approved action + granted permission). Never generates Action, never bypasses governance.",
        args: {},
        async execute(_args: unknown, _context: unknown) {
          // 说明性：准入逻辑见 execution-bridge.admitExecution；plugin 侧禁止生成 Action
          return JSON.stringify({ note: "execution admission is governed; plugin does not generate Action", helpers: ["admitExecution", "refuseActionGeneration"] }, null, 2);
        },
      },
    },

    // 隔离守卫：拦截任何写入宿主 opencode 配置的尝试
    "tool.execute.before": async (input: { tool: string }, output: { args: { filePath?: string } }) => {
      if (input.tool === "write" || input.tool === "edit") {
        if (output.args?.filePath) guardHostWrite(output.args.filePath);
      }
    },

    // 服务连接时确认隔离状态（不做任何写操作）
    event: async ({ event }: { event: { type: string } }) => {
      if (event.type === "server.connected" && anyClient?.app?.log) {
        await anyClient.app.log({
          body: {
            service: "myteam-plugin",
            level: "info",
            message: "MyTeam plugin active: isolation=on, host_config_write=false, reversible=true",
          },
        });
      }
    },
  };
};

export default MyTeamPlugin;
