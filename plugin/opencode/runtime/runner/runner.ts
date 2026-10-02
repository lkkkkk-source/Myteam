/**
 * MyTeam OpenCode Plugin — Runner Core (runner.ts) — v1.7.1
 * ---------------------------------------------------------------------------
 * Phase 7 — Runner Core · 编排核心。
 *
 * 公式：
 *   RunnerInvocation + AgentExecutor(适配器) + ToolInvocationPort(下行)
 *     └─ Runner.execute() ─┐
 *                           ▼
 *                    RunnerResult（status/output/artifacts/nextAction/meta）
 *
 * execute() 流程（§4）：
 *   validate invocation → prepare context → invoke executor → (运行循环经 port 取工具)
 *   → normalize result → produce NextAction → error mapping（§5）。
 *
 * 禁则（强制）：
 *   - 不调用真实 Tool / OpenCode Tool / MCP（工具一律经 toolPort；本阶段为 mock）。
 *   - 不实现 Agent 执行体（调用 executor 适配器，不含模型推理）。
 *   - 不直接触碰文件系统（path 判定用字符串，不使用 fs）。
 *   - 不实现 Trace。
 *
 * 隔离契约（沿用）：
 *   - 只读 invocation 引用；不写 Home / Host / project（执行层才写产物）。
 * ---------------------------------------------------------------------------
 */

import type {
  RunnerInvocation,
  RunnerResult,
  RunnerMeta,
  RunnerArtifact,
  NextAction,
  ToolInvocationRequest,
  AgentExecutor,
  AgentExecutorResult,
  RunnerDeps,
  RunnerErrorKind,
  ToolInvocationPort,
} from "./types";
import { RunnerValidationError, RunnerError } from "./types";
import { createAgentExecutor } from "../agent-executor";
import type { AgentExecutionContext } from "../tool-bridge/context";
import type { AgentRuntimeInstance } from "../../agent-instance";

/** 工具重试上限（仅 tool_error 可重试；设计 §5.2）。 */
const TOOL_MAX_RETRIES = 2;
/** 工具失败退避基数（毫秒）。 */
const RETRY_BASE_MS = 50;

/** 由绝对路径推断产物相对名与 size（纯字符串 + 无 fs 依赖的 size 缺省 0 — 由登记方提供）。 */
function toArtifact(absPath: string, index: number): RunnerArtifact {
  const name =
    index.toString().padStart(3, "0") + ".artifact";
  return {
    name,
    path: absPath,
    size: 0,
    modified: "",
    kind: "other",
  };
}

/** 归一化执行体返回 → RunnerArtifact[]（只登记路径，不读文件）。 */
function normalizeArtifacts(paths: string[] | undefined): RunnerArtifact[] {
  if (!paths || paths.length === 0) return [];
  return paths.map((p, i) => toArtifact(p, i + 1));
}

/** 睡眠（用于退避）。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 校验 invocation 契约（§4 validate invocation）。
 * 失败抛 RunnerValidationError（assertion_error）。
 */
export function validateInvocation(inv: RunnerInvocation): void {
  const { run, instance, context, taskInput } = inv;
  if (!run || !run.execution_id) {
    throw new RunnerValidationError("run must have execution_id");
  }
  if (!run.input) {
    throw new RunnerValidationError("run.input (task input) is required");
  }
  if (!instance || !instance.id) {
    throw new RunnerValidationError("instance must have id");
  }
  if (instance.execution_id !== run.execution_id) {
    throw new RunnerValidationError(
      `execution_id mismatch: run=${run.execution_id} instance=${instance.execution_id}`
    );
  }
  if (!context || !context.agent_instance) {
    throw new RunnerValidationError("context must carry agent_instance");
  }
  if (context.agent_instance.id !== instance.id) {
    throw new RunnerValidationError(
      `instance id mismatch: instance=${instance.id} context=${context.agent_instance.id}`
    );
  }
  if (!taskInput || !taskInput.goal) {
    throw new RunnerValidationError("taskInput.goal is required");
  }
  if (!Array.isArray(context.tools)) {
    throw new RunnerValidationError("context.tools must be an array");
  }
}

/**
 * 把 invocation 组装为 TaskInput（§4 prepare context）。
 * TaskInput 只引用 instance 的既有字段，不新建任何预置。
 */
export function prepareTaskInput(inv: RunnerInvocation) {
  const { run, instance } = inv;
  return {
    goal: run.input,
    prompt_source: instance.prompt_source,
    workspace: instance.workspace,
    memory_ns: instance.memory_namespace,
    permissions: instance.permissions,
    execution_id: run.execution_id,
    instance_id: instance.id,
    agent: instance.agent,
  };
}

/**
 * 工具调用校验 + 组装请求（§4 invoke port + §4.3 校验）。
 * 校验通过才发起；allowed=false / 未知工具 / 越域 → 抛断言错误（不绕过）。
 */
export async function invokeTool(
  deps: RunnerDeps,
  tool: string,
  source: "host" | "mcp",
  args: Record<string, unknown>,
  contextTools: { tool: string; source: "host" | "mcp"; allowed: boolean }[],
  security: { allowed_paths: string[]; deny_paths: string[]; host_config: string },
  signal?: AbortSignal
): Promise<import("./types").ToolInvocationResult> {
  const decl = contextTools.find((t) => t.tool === tool);
  if (!decl) {
    throw new RunnerValidationError(`tool not declared: ${tool}`);
  }
  if (decl.source !== source) {
    throw new RunnerValidationError(
      `tool source mismatch: ${tool} declared as ${decl.source}, requested as ${source}`
    );
  }
  if (!decl.allowed) {
    throw new RunnerValidationError(
      `tool denied by permission model: ${tool} (allowed=false)`
    );
  }
  // 路径类参数的纯字符串域名校验（.team 与 project_root 域名判断；不触碰 fs）
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" && /(?:read|write|edit|path)/i.test(k) && v.length > 0) {
      const p = v.replace(/\\/g, "/");
      const allowed = security.allowed_paths.some(
        (ap) => p === ap.replace(/\\/g, "/") || p.startsWith(ap.replace(/\\/g, "/") + "/")
      );
      const denied = security.deny_paths.some(
        (dp) => p === dp.replace(/\\/g, "/") || p.startsWith(dp.replace(/\\/g, "/") + "/")
      );
      if (!allowed || denied) {
        throw new RunnerValidationError(
          `path outside allowed/inside deny domain: ${k}=${p}`
        );
      }
    }
  }

  const req: ToolInvocationRequest = {
    tool,
    source,
    arguments: args,
    allowed: decl.allowed,
    security: {
      allowed_paths: security.allowed_paths,
      deny_paths: security.deny_paths,
      host_config: security.host_config,
    },
  };

  // 重试策略：仅可重试的 tool 失败（tool_error 且可重试）才重试；
  // 安全域 / 参数类失败（assertion_error）不可重试，立即抛出。
  let last: import("./types").ToolInvocationResult | null = null;
  for (let attempt = 0; attempt <= TOOL_MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw buildError("cancel", "cancel requested before tool call");
    }
    last = await deps.toolPort.invoke(req);
    if (last.ok) return last;
    // 不可重试的错误（assertion_error 等）→ 立即抛出，不重试
    if (last.error_kind === "assertion_error") {
      throw new RunnerError("assertion_error", last.error || `tool rejected: ${tool}`);
    }
    if (attempt < TOOL_MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * 2 ** attempt);
    }
  }
  if (!last) {
    throw buildError("tool_error", "tool invocation produced no result");
  }
  throw buildError("tool_error", last.error || `tool failed after retries: ${tool}`);
}

/** 构造 RunnerError（聚合错误分类，携带 kind）。 */
function buildError(kind: RunnerErrorKind, message: string): RunnerError {
  return new RunnerError(kind, message);
}

/**
 * 组装 RunnerMeta（§3）。
 */
function buildMeta(
  started: number,
  done: number,
  error?: { kind: RunnerErrorKind; detail?: string }
): RunnerMeta {
  return {
    started: new Date(started).toISOString(),
    completed: new Date(done).toISOString(),
    error: error?.kind,
    errorDetail: error?.detail,
  };
}

/**
 * 依据状态产出 NextAction（§3.4）。
 *  - completed + artifacts → "complete"（任务完成）
 *  - checkpointRequested → "human_checkpoint"（仅产生；不自动处理）
 *  - ok=true 但未要求 checkpoint 且无 outer Transition → "continue"
 *  - failed → "fail"
 */
export function produceNextAction(result: AgentExecutorResult): NextAction {
  if (result.checkpointRequested) return "human_checkpoint";
  if (!result.ok) return "fail";
  return "complete";
}

/**
 * 归一化执行体结果 → RunnerResult（§4 normalize result）。
 * 结果摘要写入 output；产物登记；nextAction 生成。
 */
export function normalizeResult(
  execResult: AgentExecutorResult,
  started: number,
  done: number
): RunnerResult {
  const nextAction = produceNextAction(execResult);
  const status =
    nextAction === "fail"
      ? "failed"
      : nextAction === "human_checkpoint"
        ? "checkpoint_requested"
        : "completed";

  // Checkpoint 无损（C-2）：优先镜像执行体真实 message/options；仅缺失时兜底。
  const checkpoint =
    status === "checkpoint_requested"
      ? {
          message:
            (execResult.checkpointMessage ?? (execResult.output || "checkpoint requested by executor")),
          options: execResult.checkpointOptions,
        }
      : undefined;

  return {
    status,
    output: execResult.output || "",
    artifacts: normalizeArtifacts(execResult.artifacts),
    nextAction,
    checkpoint,
    meta: buildMeta(started, done, execResult.ok ? undefined : { kind: "agent_error", detail: execResult.error }),
  };
}

/**
 * Runner 编排核心（§4 execute()）。
 * 流程：validate → prepare → invoke executor → normalize → produce NextAction。
 * 错误映射（§5）：任何异常（含校验失败）都映射为带 kind 的失败 RunnerResult，
 *   不外泄裸异常。
 */
export async function execute(
  inv: RunnerInvocation,
  deps: RunnerDeps
): Promise<RunnerResult> {
  const started = deps.now ? deps.now() : Date.now();

  // 构建执行阶段：validate → prepare → executor → normalize
  const build = async (): Promise<RunnerResult> => {
    validateInvocation(inv);
    const taskInput = prepareTaskInput(inv);
    const execResult = await deps.executor.execute(taskInput, deps.signal);
    const done = deps.now ? deps.now() : Date.now();
    const r = normalizeResult(execResult, started, done);
    // 取消信号在 executor 返回后仍未触发 → 正常；否则映射 cancel
    if (deps.signal?.aborted) {
      return failure(started, done, "cancel", "aborted after completion");
    }
    return r;
  };

  // 无超时：直接执行（异常 → mapError 折叠为失败 RunnerResult）
  if (!inv.timeout_ms || inv.timeout_ms <= 0) {
    try {
      return await build();
    } catch (e) {
      return mapError(e, started, deps);
    }
  }

  // 有超时：竞速 + 超时映射
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(buildError("timeout", `exceeded ${inv.timeout_ms}ms`));
    }, inv.timeout_ms);
  });
  try {
    return await Promise.race([build(), timeout]);
  } catch (e) {
    return mapError(e, started, deps);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 错误映射（§5）：把所有异常归类为 RunnerErrorKind 并构建失败 RunnerResult。 */
function mapError(
  e: unknown,
  started: number,
  deps: RunnerDeps
): RunnerResult {
  const now = deps.now ? deps.now() : Date.now();
  if (e instanceof RunnerValidationError) {
    return failure(started, now, "assertion_error", e.message);
  }
  if (e instanceof RunnerError) {
    return failure(started, now, e.kind, e.message);
  }
  // AbortError（宿主取消）
  if (
    (typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError") ||
    deps.signal?.aborted
  ) {
    return failure(started, now, "cancel", deps.signal?.reason ? String(deps.signal.reason) : "aborted");
  }
  // 其余归 agent_error（执行体抛错）
  return failure(started, now, "agent_error", e instanceof Error ? e.message : String(e));
}

function failure(
  started: number,
  done: number,
  kind: RunnerErrorKind,
  detail: string
): RunnerResult {
  return {
    status: "failed",
    output: "",
    artifacts: [],
    nextAction: "fail",
    meta: buildMeta(started, done, { kind, detail }),
  };
}

// ---------------------------------------------------------------------------
// Phase 8 — createRunnerDeps（默认执行器工厂）
// ---------------------------------------------------------------------------

/**
 * 构建默认 RunnerDeps：把 AgentExecutorImpl 作为默认 executor 注入。
 *
 * 设计要点：
 *   - Runner 仍只负责 orchestration（validate / prepare / normalize / error mapping）。
 *   - AgentExecutorImpl 仍不调用 Tool（工具一律经 ToolInvocationPort）。
 *   - toolPort 必须显式传入（本阶段为 mock 或真实 hostPort）；不允许隐式默认。
 *   - 调用方可继续手动注入 mock executor（向后兼容）。
 *
 * 使用示例：
 * ```ts
 * const deps = createRunnerDeps({
 *   toolPort: hostPort,
 *   context: ctx,
 *   instance: inst,
 *   signal,
 * });
 * const result = await execute(invocation, deps);
 * ```
 */
export function createRunnerDeps(options: {
  /** 工具下行端口（Runner 唯一工具通道）。 */
  toolPort: ToolInvocationPort;
  /** Tool Bridge 产物。 */
  context: AgentExecutionContext;
  /** Runtime 投影。 */
  instance: AgentRuntimeInstance;
  /** 取消信号（可选）。 */
  signal?: AbortSignal;
  /** 系统时钟（可选；测试注入）。 */
  now?: () => number;
  /** 显式指定 executor（覆盖默认的 AgentExecutorImpl；用于 mock 兼容）。 */
  executor?: AgentExecutor;
}): RunnerDeps {
  const executor =
    options.executor ??
    createAgentExecutor(options.context, options.instance, options.toolPort, options.signal);

  return {
    toolPort: options.toolPort,
    executor,
    now: options.now,
    signal: options.signal,
  };
}