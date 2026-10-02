/**
 * MyTeam OpenCode Plugin — Runner · Types (types.ts) — v1.7.1
 * ---------------------------------------------------------------------------
 * Phase 7 — Runner Core · 类型模型。
 *
 * 本模块只定义 Runner 的输入/输出/错误/端口契约；不含任何执行逻辑。
 * 引用 v1.6.5 AgentRun、v1.6.1 AgentRuntimeInstance、v1.6.3 AgentExecutionContext，
 * 引用而不复制字段。
 *
 * 禁则（与 Runner 架构一致）：
 *   - 不调用真实 Tool / OpenCode Tool / MCP。
 *   - 不实现 Agent 执行体、不实现 Trace。
 *   - 本模块不触碰文件系统。
 * ---------------------------------------------------------------------------
 */

import type { AgentRun } from "../execution/types";
import type { AgentRuntimeInstance } from "../../agent-instance";
import type { AgentExecutionContext } from "../tool-bridge/context";

// ---------------------------------------------------------------------------
// RunnerInvocation（Runner 一次执行的全部输入，§2）
// ---------------------------------------------------------------------------

/** Runner 组装后的「执行输入」——执行体不自行猜测输入。 */
export interface TaskInput {
  /** 目标：源自 AgentRun.input（本轮任务提示摘要）。 */
  goal: string;
  /** 引用 myteam_home 的 prompt 文件（只读，不复制）。 */
  prompt_source: string;
  /** workspace 根（= instance.workspace，已规范化）。 */
  workspace: string;
  /** memory 命名空间（= instance.memory_namespace，team_root/memory 域内）。 */
  memory_ns: string;
  /** 权限白名单（= instance.permissions，静态声明）。 */
  permissions: string[];
  /** 执行 ID（= run.execution_id，链路追踪 ids，非 Trace 实现）。 */
  execution_id: string;
  /** 实例 ID（= instance.id）。 */
  instance_id: string;
  /** agent 名称（= instance.agent）。 */
  agent: string;
}

/** Runner 一次 execute() 的全部输入（§2 Runner Input Model）。 */
export interface RunnerInvocation {
  /** v1.6.5 AgentRun 引用（本次要跑的调用；input 为任务提示）。 */
  run: AgentRun;
  /** v1.6.1 AgentRuntimeInstance 引用。 */
  instance: AgentRuntimeInstance;
  /** v1.6.3 AgentExecutionContext 引用（能力上下文，只读）。 */
  context: AgentExecutionContext;
  /** Runner 组装后的执行输入。 */
  taskInput: TaskInput;
  /** 超时上限（毫秒；0/缺省 = 无超时）。 */
  timeout_ms?: number;
}

// ---------------------------------------------------------------------------
// RunnerResult / Artifacts / NextAction（§3）
// ---------------------------------------------------------------------------

/** 产物描述（文件本体在 result/ 目录；这里只登记描述）。 */
export interface RunnerArtifact {
  /** 相对 result 目录的文件名。 */
  name: string;
  /** 绝对路径（= resultDir/<name>）。 */
  path: string;
  /** 字节数。 */
  size: number;
  /** 最后修改时间。 */
  modified: string;
  /** 产物类别。 */
  kind: "document" | "data" | "media" | "other";
}

/** Runner 一次 execute() 的输出（§3 Output Model）。 */
export interface RunnerResult {
  /** 结果状态：completed / failed / checkpoint_requested。 */
  status: RunnerStatus;
  /** 结果摘要（= AgentRun.output 的候选）。 */
  output: string;
  /** 登记到的产物（文件本体由执行层落盘，Runner 只登记）。 */
  artifacts: RunnerArtifact[];
  /**
   * 单次执行级决策。
   */
  nextAction: NextAction;
  /** checkpoint 请求明细（status=checkpoint_requested 时；由执行体原样镜像，缺失则兜底）。 */
  checkpoint?: {
    message: string;
    options?: string[];
  };
  /** 计时 + 失败原因（非 Trace 埋点）。 */
  meta: RunnerMeta;
}

export type RunnerStatus = "completed" | "failed" | "checkpoint_requested";

/** 单 AgentRun 结束后的最小调度指令（§3.4）。 */
export type NextAction =
  | "continue"
  | "human_checkpoint"
  | "transition"
  | "complete"
  | "fail";

export interface RunnerMeta {
  /** 开始时间（ISO-8601）。 */
  started: string;
  /** 结束时间（ISO-8601）。 */
  completed: string;
  /** 失败类别（status=failed 时）。 */
  error?: RunnerErrorKind;
  /** 失败细节（status=failed 时，人类可读）。 */
  errorDetail?: string;
}

// ---------------------------------------------------------------------------
// Error Mapping（§5）
// ---------------------------------------------------------------------------

/** Runner 错误分类（与 §5 表一致）。 */
export type RunnerErrorKind =
  /** tool 失败（可重试）。 */
  | "tool_error"
  /** agent 执行体自身失败（不可重试）。 */
  | "agent_error"
  /** 超时。 */
  | "timeout"
  /** 用户/调度取消。 */
  | "cancel"
  /** 校验失败 / 状态非法。 */
  | "assertion_error";

/** Runner 校验 / 状态非法错误。 */
export class RunnerError extends Error {
  readonly kind: RunnerErrorKind;
  constructor(kind: RunnerErrorKind, message: string) {
    super(`[myteam-runner] ${message}`);
    this.kind = kind;
  }
}

/** 校验失败（invocation 不满足契约）。 */
export class RunnerValidationError extends RunnerError {
  constructor(message: string) {
    super("assertion_error", `validation: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Tool Invocation Boundary（§4）
// ---------------------------------------------------------------------------

/** 工具调用请求（Runner 校验后转发给 ToolInvocationPort，不自行执行）。 */
export interface ToolInvocationRequest {
  /** 工具名（必须 ∈ context.tools[].tool）。 */
  tool: string;
  /** 工具来源：host（内置）或 mcp。 */
  source: "host" | "mcp";
  /** 调用参数。 */
  arguments: Record<string, unknown>;
  /** context.tools 中该工具的 allowed 值（Runner 校验后写入）。 */
  allowed: boolean;
  /** 安全域（继承自 context.security；路径类参数由 Tool Bridge 二次拦截）。 */
  security: {
    allowed_paths: string[];
    deny_paths: string[];
    host_config: string;
  };
}

/** 工具调用结果（由 Tool Bridge 未来调用接口返回；本阶段 mock 也返回该形状）。 */
export interface ToolInvocationResult {
  ok: boolean;
  /** 成功返回值。 */
  value?: unknown;
  /** ok=false 时失败原因。 */
  error?: string;
  /** ok=false 时错误分类（由 Tool Adapter §5 归一；Runner 据此映射 meta.error）。 */
  error_kind?: RunnerErrorKind;
  /** ok=false 时宿主层错误码（可选，如 ENOENT；Adapter §5 归一依据）。 */
  error_code?: string;
  /** 执行耗时（毫秒）。 */
  duration: number;
}

/**
 * ToolInvocationPort —— Runner 唯一的工具下行通道。
 * 本阶段（v1.7.1）不接入真实工具；调用方提供 mock 实现。
 * 未来由 Tool Bridge 调用接口（v1.7.x）实现真实 invoke()。
 */
export interface ToolInvocationPort {
  invoke(request: ToolInvocationRequest): Promise<ToolInvocationResult>;
}

// ---------------------------------------------------------------------------
// AgentExecutor（Runner 唯一外部执行通道；本阶段不实现执行体）
// ---------------------------------------------------------------------------

/** 可插拔的执行适配器：把 TaskInput 搬上执行体并返回结果。 */
export interface AgentExecutor {
  execute(
    taskInput: TaskInput,
    signal?: AbortSignal
  ): Promise<AgentExecutorResult>;
}

/** 执行体返回的结果（Agent 自身执行结果，与工具结果区分）。 */
export interface AgentExecutorResult {
  /** 是否成功（失败 = agent_error）。 */
  ok: boolean;
  /** 结果摘要（将写入 AgentRun.output）。 */
  output: string;
  /** 失败原因（ok=false 时）。 */
  error?: string;
  /** 执行体产出的文件（绝对路径；Runner 登记为 RunnerArtifact）。 */
  artifacts?: string[];
  /** 执行体主动请求人工确认。 */
  checkpointRequested?: boolean;
  /** 请求人工确认时提供的说明。 */
  checkpointMessage?: string;
  /** 请求人工确认时的可选选项。 */
  checkpointOptions?: string[];
}

// ---------------------------------------------------------------------------
// RunnerDeps（注入依赖；与 v1.6.7 EngineDeps 同风格）
// ---------------------------------------------------------------------------

/** Runner 运行所需的外部能力。默认实现把校验/超时留在本层，不碰磁盘。 */
export interface RunnerDeps {
  /** 工具下行端口（本阶段必须为 mock）。 */
  toolPort: ToolInvocationPort;
  /** 执行适配器（本阶段必须为 mock / 测试桩）。 */
  executor: AgentExecutor;
  /** 系统时钟（毫秒时间戳），供计时；测试可注入。 */
  now?: () => number;
  /** 取消信号。 */
  signal?: AbortSignal;
}
