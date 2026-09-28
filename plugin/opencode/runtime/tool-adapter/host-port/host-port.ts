/**
 * MyTeam OpenCode Plugin — Tool Adapter · Host Port (host-port.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * 设计 §6 宿主下发：把 v1.7.1 的 mock hostPort 替换为真实的 OpenCode 宿主工具通道。
 *
 * 实现契约（任务 v1.7.3 规定）：
 *   - OpenCodeHostPort 实现 runner/types.ts 的 ToolInvocationPort：
 *       invoke(req, opts): Promise<ToolInvocationResult>
 *       返回形状 { ok, value?, error?, error_kind?, error_code?, duration }。
 *   - 工具名路由（只读端点映射）：
 *       read              -> file.read({ path, directory })
 *       glob / find       -> find.files({ query, directory })
 *       grep              -> find.text({ pattern, directory })
 *       symbols           -> find.symbols({ query, directory })
 *       list / ls         -> file.list({ path, directory })
 *       path / get_path   -> path.get({ directory })
 *       mcp:<s>:<m>       -> mcp.invoke(s, m, args)（可选；宿主执行）
 *
 *   - 只读边界（强制）：
 *       - 不创建、不修改、不删除任何宿主文件；
 *       - 不启动、不管理 MCP 进程；MCP 只走宿主已有通道（opts.mcp 载荷下发，宿主执行）；
 *       - 不写 opencode.json；不新增宿主配置；
 *       - write 类请求：本通道不做宿主写下发，直接返回
 *         ok=false + error_kind="assertion_error"（宿主写职责归 OpenCode 宿主工具本体，
 *         本 Adapter 通道保持只读）。
 *
 *   - 错误归一：
 *       宿主非 2xx / 异常 -> 调用 error-map.ts 的 mapHostError() 归一为 RunnerErrorKind，
 *       并附 error_code（宿主状态码 / 错误码名），写入 ToolInvocationResult。
 *
 * 禁则：
 *   - 不调用非只读 OpenCode 端点（不实现 create/update/delete/execute）；
 *   - 不引入 Trace 事件；duration 仅作结果标注；
 *   - 不修改 AgentExecutionContext；只读 ToolInvocationRequest。
 * ---------------------------------------------------------------------------
 */

import type {
  ToolInvocationRequest,
  ToolInvocationResult,
  RunnerErrorKind,
} from "../../runner/types";
import { mapHostError } from "../error-map";
import type { HostError } from "../error-map";

// ---------------------------------------------------------------------------
// OpenCode 宿主 client 最小类型子集（对齐 @opencode-ai/sdk v1.14.x OpencodeClient）
// ---------------------------------------------------------------------------

/** OpenCode 宿主 File API 最小契约（只读方法；来自 sdk.gen.d.ts 子集）。 */
export interface OpenCodeFileClient {
  /** GET /file/content -> { type, content, diff?, patch? } */
  read(opts: {
    query: { path: string; directory?: string };
  }): Promise<{
    data?: { type: string; content: string; diff?: string; patch?: unknown };
    response?: unknown;
  }>;
  /** GET /file -> FileNode[]（可选） */
  list?(opts: {
    query: { path: string; directory?: string };
  }): Promise<{
    data?: Array<{ name: string; path: string; absolute: string; type: string; ignored?: boolean }>;
    response?: unknown;
  }>;
}

/** OpenCode 宿主 Find API 最小契约（只读方法）。 */
export interface OpenCodeFindClient {
  /** GET /find -> 文本匹配列表 */
  text?(opts: {
    query: { pattern: string; directory?: string };
  }): Promise<{
    data?: Array<{ path: string; line?: number; text?: string }>;
    response?: unknown;
  }>;
  /** GET /find/file -> 文件路径列表 */
  files?(opts: {
    query: { query: string; directory?: string; dirs?: "true" | "false" };
  }): Promise<{
    data?: string[];
    response?: unknown;
  }>;
  /** GET /find/symbol -> 符号列表 */
  symbols?(opts: {
    query: { query: string; directory?: string };
  }): Promise<{
    data?: Array<{ name: string; kind?: string; path?: string }>;
    response?: unknown;
  }>;
}

/** OpenCode 宿主 Path API 最小契约。 */
export interface OpenCodePathClient {
  /** GET /path -> Path 对象 */
  get?(opts?: {
    query?: { directory?: string };
  }): Promise<{
    data?: { state?: string; config?: string; worktree?: string; directory?: string };
    response?: unknown;
  }>;
}

/**
 * OpenCode 宿主 MCP API 最小契约（宿主侧已有 MCP client；本通道只下发载荷，
 * 不管理 MCP 进程、不启动 MCP、不写宿主 MCP 配置）。
 */
export interface OpenCodeMcpClient {
  /** 调用 MCP 工具 -> 结果（宿主执行） */
  invoke?(server: string, method: string, args: Record<string, unknown>): Promise<unknown>;
  /** 查询 MCP 服务器状态（可选） */
  status?(server?: string): Promise<unknown>;
}

/**
 * OpenCode 宿主 client 完整最小子集。
 * 注入来源：bridge.ts 的 MyTeamRuntimeView / 插件入口 index.ts 的 ctx.client。
 */
export interface OpenCodeClientSubset {
  file?: OpenCodeFileClient;
  find?: OpenCodeFindClient;
  path?: OpenCodePathClient;
  mcp?: OpenCodeMcpClient;
}

// ---------------------------------------------------------------------------
// OpenCodeHostPort —— ToolInvocationPort 的真实宿主实现（只读通道）
// ---------------------------------------------------------------------------

/**
 * OpenCodeHostPort：把 ToolInvocationRequest 路由到 OpenCode 宿主只读 API。
 *
 * 错误归一（通过 error-map.ts mapHostError）：
 *   - 宿主 4xx/5xx 响应  -> tool_error（可重试性由状态码决定：5xx/408/429 可重试）
 *   - 超时              -> timeout（不可重试）
 *   - 取消              -> cancel（不可重试）
 *   - 宿主能力缺失      -> agent_error（不可重试，宿主 API 未注入）
 *   - 参数校验失败      -> tool_error（不可重试，参数错误重试无效）
 *   - write 请求        -> assertion_error（只读通道，宿主写不下发）
 */
export class OpenCodeHostPort {
  private readonly client: OpenCodeClientSubset;
  /** 默认工作目录（来自 AgentExecutionContext.workspace 或 agent_instance.workspace）。 */
  private readonly workspace: string;

  constructor(client: OpenCodeClientSubset, workspace: string) {
    this.client = client;
    this.workspace = workspace;
  }

  /**
   * ToolInvocationPort.invoke —— 宿主下发入口。
   * @param req  已校验的工具调用请求（Runner 侧已完成 allowed / security 前置断言）
   * @param opts 可选 MCP 载荷（mcp-map.ts 产出）；source=mcp 时由 Adapter 注入
   */
  async invoke(
    req: ToolInvocationRequest,
    opts: { mcp?: { server: string; method: string; args: Record<string, unknown> } } = {}
  ): Promise<ToolInvocationResult> {
    const started = Date.now();

    // write 类工具：只读通道，直接拦截（不实际下发）
    if (req.tool === "write" || req.tool === "edit" || req.tool === "patch") {
      return {
        ok: false,
        error: `host-port: "${req.tool}" is not dispatched via read-only channel; write is handled by the OpenCode host tool natively`,
        error_kind: "assertion_error",
        error_code: "EREAD_ONLY_CHANNEL",
        duration: Date.now() - started,
      };
    }

    try {
      const value = await this.route(req, opts);
      return {
        ok: true,
        value,
        duration: Date.now() - started,
      };
    } catch (e) {
      const detail = describeHostFailure(e);

      // HTTP 状态码特判（HostResponseError）：4xx/5xx -> tool_error
      // 5xx/408/429 可重试（宿主瞬时故障）；4xx 不可重试（请求本身错误）
      if (e instanceof HostResponseError) {
        const status = e.status;
        const retryable = status >= 500 || status === 408 || status === 429;
        return {
          ok: false,
          error: `host ${e.endpoint} returned status ${status}`,
          error_kind: "tool_error",
          error_code: String(status),
          duration: Date.now() - started,
        };
      }

      // 参数校验失败（ToolArgumentError）：-> tool_error，error_code=EINVALID_ARG
      if (e instanceof ToolArgumentError) {
        return {
          ok: false,
          error: e.message,
          error_kind: "tool_error",
          error_code: "EINVALID_ARG",
          duration: Date.now() - started,
        };
      }

      // 宿主能力缺失（HostCapabilityError）：-> agent_error（宿主 API 未注入）
      if (e instanceof HostCapabilityError) {
        return {
          ok: false,
          error: e.message,
          error_kind: "agent_error",
          duration: Date.now() - started,
        };
      }

      // 其他异常：通过 error-map.ts 统一归一
      const hostErr: HostError = {
        code: (e as { code?: string }).code,
        message: detail,
        timeout: isTimeoutError(e),
        cancelled: isAbortError(e),
        hostRejectWrite: isWriteReject(e),
      };
      const mapped = mapHostError(hostErr);
      return {
        ok: false,
        error: mapped.detail,
        error_kind: mapped.kind,
        error_code: hostErr.code,
        duration: Date.now() - started,
      };
    }
  }

  // -------------------------------------------------------------------------
  // 路由分发
  // -------------------------------------------------------------------------

  private async route(
    req: ToolInvocationRequest,
    opts: { mcp?: { server: string; method: string; args: Record<string, unknown> } }
  ): Promise<unknown> {
    // MCP 工具（mcp:<server>:<method> 或 source=mcp）
    if (req.source === "mcp" || req.tool.startsWith("mcp:")) {
      return this.invokeMcp(req, opts);
    }

    switch (req.tool) {
      case "read":
        return this.invokeRead(req);

      case "glob":
      case "find":
      case "files":
        return this.invokeFindFiles(req);

      case "grep":
        return this.invokeFindText(req);

      case "symbols":
      case "find_symbols":
        return this.invokeFindSymbols(req);

      case "list":
      case "ls":
        return this.invokeFileList(req);

      case "path":
      case "get_path":
        return this.invokePathGet();

      default:
        // 未知工具名 -> 宿主能力缺失（agent_error，不可重试）
        throw new HostCapabilityError(
          `host-port: unknown tool "${req.tool}" (no read-only host endpoint mapping)`
        );
    }
  }

  // -------------------------------------------------------------------------
  // 各路由实现（全部只读）
  // -------------------------------------------------------------------------

  /** read -> OpenCode GET /file/content */
  private async invokeRead(req: ToolInvocationRequest): Promise<unknown> {
    const fileClient = requireClient(this.client.file, "file.read");
    const filePath = reqStringArg(req, "filePath", "path");
    if (!filePath) {
      throw new ToolArgumentError(`read: missing required argument "filePath" or "path"`);
    }
    const dir = reqStringArg(req, "directory", "dir");
    const res = await fileClient.read({
      query: { path: filePath, ...(dir ? { directory: dir } : {}) },
    });
    assertHostSuccess(res, `file.read(${filePath})`);
    return res.data ?? null;
  }

  /** glob / find / files -> OpenCode GET /find/file */
  private async invokeFindFiles(req: ToolInvocationRequest): Promise<unknown> {
    const findClient = this.client.find;
    if (!findClient?.files) {
      throw new HostCapabilityError("host-port: OpenCode Find API unavailable (client.find.files)");
    }
    const pattern = reqStringArg(req, "pattern", "query", "glob");
    if (!pattern) {
      throw new ToolArgumentError(`${req.tool}: missing required argument "pattern" or "query"`);
    }
    const dir = reqStringArg(req, "directory", "dir") ?? this.workspace;
    const dirs =
      req.arguments.dirs === true ? "true" : req.arguments.dirs === false ? "false" : undefined;
    const res = await findClient.files({
      query: { query: pattern, directory: dir, ...(dirs ? { dirs } : {}) },
    });
    assertHostSuccess(res, `find.files(${pattern})`);
    return res.data ?? [];
  }

  /** grep -> OpenCode GET /find（文本搜索） */
  private async invokeFindText(req: ToolInvocationRequest): Promise<unknown> {
    const findClient = this.client.find;
    if (!findClient?.text) {
      throw new HostCapabilityError("host-port: OpenCode Find API unavailable (client.find.text)");
    }
    const pattern = reqStringArg(req, "pattern", "query");
    if (!pattern) {
      throw new ToolArgumentError(`grep: missing required argument "pattern" or "query"`);
    }
    const dir = reqStringArg(req, "directory", "dir") ?? this.workspace;
    const res = await findClient.text({
      query: { pattern, directory: dir },
    });
    assertHostSuccess(res, `find.text(${pattern})`);
    return res.data ?? [];
  }

  /** symbols / find_symbols -> OpenCode GET /find/symbol */
  private async invokeFindSymbols(req: ToolInvocationRequest): Promise<unknown> {
    const findClient = this.client.find;
    if (!findClient?.symbols) {
      throw new HostCapabilityError("host-port: OpenCode Find API unavailable (client.find.symbols)");
    }
    const query = reqStringArg(req, "query", "pattern", "symbol");
    if (!query) {
      throw new ToolArgumentError(`${req.tool}: missing required argument "query" or "symbol"`);
    }
    const dir = reqStringArg(req, "directory", "dir") ?? this.workspace;
    const res = await findClient.symbols({
      query: { query, directory: dir },
    });
    assertHostSuccess(res, `find.symbols(${query})`);
    return res.data ?? [];
  }

  /** list / ls -> OpenCode GET /file（目录列） */
  private async invokeFileList(req: ToolInvocationRequest): Promise<unknown> {
    const fileClient = this.client.file;
    if (!fileClient?.list) {
      throw new HostCapabilityError("host-port: OpenCode File API unavailable (client.file.list)");
    }
    const dirPath = reqStringArg(req, "path", "directory", "dir") ?? this.workspace;
    const res = await fileClient.list({
      query: { path: dirPath },
    });
    assertHostSuccess(res, `file.list(${dirPath})`);
    return res.data ?? [];
  }

  /** path / get_path -> OpenCode GET /path */
  private async invokePathGet(): Promise<unknown> {
    const pathClient = this.client.path;
    if (!pathClient?.get) {
      throw new HostCapabilityError("host-port: OpenCode Path API unavailable (client.path.get)");
    }
    const res = await pathClient.get({
      query: this.workspace ? { directory: this.workspace } : {},
    });
    assertHostSuccess(res, "path.get()");
    return res.data ?? null;
  }

  /**
   * mcp:<server>:<method> -> OpenCode MCP API（宿主执行；本通道只下发载荷，
   * 不启动 MCP、不管理 MCP 进程、不写宿主 MCP 配置）。
   */
  private async invokeMcp(
    req: ToolInvocationRequest,
    opts: { mcp?: { server: string; method: string; args: Record<string, unknown> } }
  ): Promise<unknown> {
    const mcpOpts = opts.mcp;
    if (!mcpOpts) {
      throw new ToolArgumentError(
        `${req.tool}: mcp invocation payload missing (Adapter §4 mcp-map failed to produce invocation)`
      );
    }
    const mcpClient = this.client.mcp;
    if (!mcpClient?.invoke) {
      throw new HostCapabilityError(
        `host-port: OpenCode MCP client unavailable (client.mcp.invoke); server="${mcpOpts.server}" method="${mcpOpts.method}"`
      );
    }
    // 宿主执行 MCP 调用（本通道只负责载荷下发）
    const value = await mcpClient.invoke(mcpOpts.server, mcpOpts.method, mcpOpts.args);
    return value;
  }
}

// ---------------------------------------------------------------------------
// 内部异常类型
// ---------------------------------------------------------------------------

/** 宿主能力缺失（API 未注入 / 端点不存在；agent_error，不可重试）。 */
class HostCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostCapabilityError";
  }
}

/** 工具参数校验失败（tool_error，不可重试）。 */
class ToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolArgumentError";
  }
}

/**
 * 宿主 HTTP 响应非成功状态码（tool_error，可重试性由状态码决定）。
 * 由 assertHostSuccess 抛出；携带 status + endpoint。
 */
class HostResponseError extends Error {
  readonly status: number;
  readonly endpoint: string;
  constructor(status: number, endpoint: string) {
    super(`non-success response (${status}) on ${endpoint}`);
    this.name = "HostResponseError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

// ---------------------------------------------------------------------------
// 内部辅助函数
// ---------------------------------------------------------------------------

/** 从 request.arguments 中取第一个存在的字符串参数（多个候选 key，按顺序）。 */
function reqStringArg(req: ToolInvocationRequest, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = req.arguments[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/** 要求 client 存在，否则抛 HostCapabilityError。 */
function requireClient<T>(client: T | undefined, name: string): T {
  if (!client) {
    throw new HostCapabilityError(`host-port: OpenCode API unavailable (${name})`);
  }
  return client;
}

/** 校验宿主响应，非 2xx 时抛出 HostResponseError。 */
function assertHostSuccess(res: { data?: unknown; response?: unknown }, endpoint: string): void {
  if (res.response === undefined || res.response === null) return; // 无 response 字段 -> 视为成功
  const status = extractStatus(res.response);
  if (status >= 200 && status < 300) return;
  throw new HostResponseError(status, endpoint);
}

/** 提取宿主响应状态码（兼容 { status } / { statusCode } / 数字 / Response 实例）。 */
function extractStatus(response: unknown): number {
  if (typeof response === "number") return response;
  if (response && typeof response === "object") {
    const r = response as Record<string, unknown>;
    if (typeof r.status === "number") return r.status;
    if (typeof r.statusCode === "number") return r.statusCode;
  }
  return 500;
}

/** 判断异常是否为超时。 */
function isTimeoutError(e: unknown): boolean {
  if (!e) return false;
  const err = e as Record<string, unknown>;
  if (err.name === "TimeoutError" || err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT")
    return true;
  if (typeof err.message === "string" && /timeout|timed out/i.test(err.message)) return true;
  return false;
}

/** 判断异常是否为取消（AbortSignal）。 */
function isAbortError(e: unknown): boolean {
  if (!e) return false;
  const err = e as Record<string, unknown>;
  if (err.name === "AbortError" || err.code === "ABORT_ERR" || err.name === "CanceledError")
    return true;
  if (typeof err.message === "string" && /abort|cancel/i.test(err.message)) return true;
  return false;
}

/** 判断异常是否为宿主写拒绝（只读通道命中 write）。 */
function isWriteReject(e: unknown): boolean {
  if (!e) return false;
  const err = e as Record<string, unknown>;
  if (err.name === "HostResponseError") {
    const he = err as unknown as HostResponseError;
    // 403 / 401 -> 宿主拒绝写
    return he.status === 403 || he.status === 401;
  }
  return false;
}

/** 把异常转成人类可读描述。 */
function describeHostFailure(e: unknown): string {
  if (e instanceof HostResponseError) {
    return `host ${e.endpoint} returned status ${e.status}`;
  }
  if (e instanceof HostCapabilityError) return e.message;
  if (e instanceof ToolArgumentError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

// ---------------------------------------------------------------------------
// 工厂：从 OpenCode 宿主 client 构造 OpenCodeHostPort
// ---------------------------------------------------------------------------

/**
 * createOpenCodeHostPort —— 供 Runner 注入的工厂函数。
 *
 * @param client OpenCode 宿主 client 最小子集（由 bridge.ts / 插件入口 index.ts 注入）
 * @param workspace AgentExecutionContext 的 workspace 根（缺省工作目录；find 类请求默认在此目录内）
 *
 * 使用示例（Runner 注入）：
 * ```ts
 * const hostPort = createOpenCodeHostPort(ctxClient, context.workspace);
 * const adapter = new ToolAdapter(context, { hostPort, now });
 * const result = await adapter.invoke(request);
 * ```
 */
export function createOpenCodeHostPort(
  client: OpenCodeClientSubset,
  workspace: string
): OpenCodeHostPort {
  return new OpenCodeHostPort(client, workspace);
}
