/**
 * MyTeam OpenCode Plugin — Agent Executor (agent-executor.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 3 — AgentExecutor V2：完整执行管线。
 *
 * 管线（设计 §5）：
 *   TaskInput ──▶ [1] validateTaskInput（契约校验）
 *              ──▶ [2] assemble（Prompt Assembly：引用 Home prompt，不复制）
 *              ──▶ [3] complete（Model Adapter：唯一推理入口）
 *              ──▶ [4] parse（Response Parser：模型输出 → 结构化）
 *              ──▶ [5] validate（Action Validator：唯一放行闸门，Fail-Closed）
 *              ──▶ [6] dispatch（answer / checkpoint / tool_calls）
 *              ──▶ AgentExecutorResult
 *
 * 错误模型（设计 §8）：任何异常不外泄裸异常；按 AgentErrorKind 折叠进 error 串。
 * Checkpoint 无损（设计 §6）：message / options 由 checkpointMessage / checkpointOptions
 *   原样带出，Runner 只镜像、不覆盖。
 *
 * 禁则（本阶段强制）：
 *   - 不直接 import fs（除纯内存计算）；不直接调用 OpenCode Tool / MCP。
 *   - 不联网、不读 API Key；真实模型由上层显式注入 ModelAdapter。
 *   - 不复制 prompt 正文到项目 / runtime（仅引用 instance.prompt_source）。
 * ---------------------------------------------------------------------------
 */

import type {
  AgentExecutor,
  AgentExecutorResult,
  TaskInput,
  ToolInvocationPort,
  ToolInvocationRequest,
  ToolInvocationResult,
} from "../runner/types";
import type { AgentExecutionContext } from "../tool-bridge/context";
import type { AgentRuntimeInstance } from "../../agent-instance";
import { RunnerError, RunnerValidationError } from "../runner/types";

import type { ModelAdapter, ModelResponse } from "../model/types";
import { createNullModelAdapter } from "../model";
import type { ExecutionPrompt, PromptAssemblyInput } from "../prompt";
import { assemble } from "../prompt";
import type { ParsedAgentResponse } from "../response-parser";
import { ResponseParser, createResponseParser } from "../response-parser";
import type { ValidatedActions } from "../action-validator";
import { ActionValidator, createActionValidator } from "../action-validator";

import { AgentError, buildFailure } from "./error-model";

// ---------------------------------------------------------------------------
// AgentExecutorDeps（注入依赖；与 RunnerDeps 同风格）
// ---------------------------------------------------------------------------

/** AgentExecutor 运行所需的外部能力。 */
export interface AgentExecutorDeps {
  /** 工具下行端口（由 Runner 注入，本阶段为 mock 或真实 hostPort）。 */
  toolPort: ToolInvocationPort;
  /** 可执行能力上下文（Tool Bridge 产物；只读）。 */
  context: AgentExecutionContext;
  /** 运行实例（Runtime 投影；只读）。 */
  instance: AgentRuntimeInstance;
  /** 可选：取消信号。 */
  signal?: AbortSignal;
  /** 可选：模型适配器（缺省 NullModelAdapter；真实接入由上层注入）。 */
  modelAdapter?: ModelAdapter;
  /** 可选：响应解析器（缺省 ResponseParser）。 */
  responseParser?: ResponseParser;
  /** 可选：动作校验器（缺省 ActionValidator；唯一放行闸门）。 */
  actionValidator?: ActionValidator;
}

// ---------------------------------------------------------------------------
// AgentExecutorImpl —— 完整执行管线
// ---------------------------------------------------------------------------

/**
 * AgentExecutorImpl —— Runner 的 AgentExecutor 实现（V2 完整管线）。
 *
 * 组装时序（设计 §5.2）：
 *   validateTaskInput → assemble → complete → parse → validate → dispatch。
 *
 * 取消语义：宿主取消通过 AbortSignal 表达；取消 → cancel（执行前 / 模型后 / 工具批内
 *   三处检查点）。
 *
 * 失败语义：管线内部显式归类以 AgentError 上抛；catch-all 折叠为失败结果，不外泄异常。
 */
export class AgentExecutorImpl implements AgentExecutor {
  private readonly deps: AgentExecutorDeps;
  private readonly modelAdapter: ModelAdapter;
  private readonly responseParser: ResponseParser;
  private readonly actionValidator: ActionValidator;

  constructor(deps: AgentExecutorDeps) {
    this.deps = deps;
    this.modelAdapter = deps.modelAdapter ?? createNullModelAdapter();
    this.responseParser = deps.responseParser ?? createResponseParser();
    this.actionValidator = deps.actionValidator ?? createActionValidator();
  }

  /** 执行管线主入口。 */
  async execute(taskInput: TaskInput, signal?: AbortSignal): Promise<AgentExecutorResult> {
    const effectiveSignal = signal ?? this.deps.signal;
    try {
      // [1] 契约校验
      this.validateTaskInput(taskInput);

      // 取消检查点（执行前）
      if (effectiveSignal?.aborted) {
        return buildFailure("cancel", "aborted before execution");
      }

      // [2] Prompt Assembly（引用 Home prompt，不复制）
      const prompt = this.assemble(taskInput);

      // [3] Model Adapter（唯一推理入口）
      const modelResponse = await this.complete(prompt, effectiveSignal);

      // 取消检查点（模型返回后）
      if (effectiveSignal?.aborted) {
        return buildFailure("cancel", "aborted after model completion");
      }

      // [4] Response Parser（模型输出 → 结构化）
      const parsed = this.parse(modelResponse);

      // [5] Action Validator（唯一放行闸门，Fail-Closed）
      const validated = this.validate(parsed);
      if (!validated.ok) {
        return buildFailure(validated.error_kind ?? "invalid_response", validated.reason);
      }

      // [6] dispatch（answer / checkpoint / tool_calls）
      return this.dispatchValidated(validated, effectiveSignal);
    } catch (e) {
      return this.collapseCatch(e, effectiveSignal);
    }
  }

  // ---------------------------------------------------------------------------
  // 内部
  // ---------------------------------------------------------------------------

  /** 校验 TaskInput 与 context / instance 的一致性（与 Runner validateInvocation 同源）。 */
  private validateTaskInput(taskInput: TaskInput): void {
    const inst = this.deps.instance;
    const ctx = this.deps.context;
    if (!taskInput.instance_id || taskInput.instance_id !== inst.id) {
      throw new RunnerValidationError(
        `instance mismatch: taskInput=${taskInput.instance_id} instance=${inst.id}`
      );
    }
    if (taskInput.workspace !== inst.workspace) {
      throw new RunnerValidationError(
        `workspace mismatch: taskInput=${taskInput.workspace} instance=${inst.workspace}`
      );
    }
    if (!taskInput.goal || taskInput.goal.trim().length === 0) {
      throw new RunnerValidationError("goal must be non-empty");
    }
    if (ctx.agent_instance.id !== inst.id) {
      throw new RunnerValidationError(
        `context.agent_instance.id mismatch: ctx=${ctx.agent_instance.id} instance=${inst.id}`
      );
    }
    if (taskInput.prompt_source !== inst.prompt_source) {
      throw new RunnerValidationError(
        `prompt_source mismatch: taskInput=${taskInput.prompt_source} instance=${inst.prompt_source}`
      );
    }
  }

  /** [2] Prompt Assembly（引用 instance.prompt_source；不读取正文）。 */
  private assemble(taskInput: TaskInput): ExecutionPrompt {
    const input: PromptAssemblyInput = {
      taskInput,
      context: this.deps.context,
      instance: this.deps.instance,
    };
    return assemble(input);
  }

  /** [3] Model Adapter：唯一推理入口（期望 JSON 结构化输出）。 */
  private async complete(
    prompt: ExecutionPrompt,
    signal?: AbortSignal
  ): Promise<ModelResponse> {
    const response = await this.modelAdapter.complete({
      prompt,
      expects: "json",
      signal,
    });
    if (!response.ok) {
      throw new AgentError(
        response.error_kind ?? "model_error",
        response.error_detail || `model failed (${response.error_kind ?? "unknown"})`
      );
    }
    return response;
  }

  /** [4] Response Parser：模型输出 → 结构化（untrusted）。 */
  private parse(modelResponse: ModelResponse): ParsedAgentResponse {
    return this.responseParser.parse(modelResponse);
  }

  /** [5] Action Validator：唯一放行闸门（Fail-Closed；不合法则不下发）。 */
  private validate(parsed: ParsedAgentResponse): ValidatedActions {
    return this.actionValidator.validate({ parsed, context: this.deps.context });
  }

  /**
   * [6] dispatch —— 按校验结果分发：
   *   answer      → 终答（output = text）
   *   checkpoint  → 请求人工确认（Checkpoint Lossless）
   *   tool_calls  → 单轮工具批处理 + 汇总
   */
  private dispatchValidated(
    validated: ValidatedActions,
    signal?: AbortSignal
  ): AgentExecutorResult {
    switch (validated.kind) {
      case "answer":
        return {
          ok: true,
          output: validated.answer.text,
          artifacts: validated.answer.artifacts ?? [],
        };
      case "checkpoint":
        return {
          ok: true,
          output: validated.checkpoint.message,
          checkpointRequested: true,
          checkpointMessage: validated.checkpoint.message,
          checkpointOptions: validated.checkpoint.options ?? [],
        };
      case "tool_calls":
        return this.invokeToolCalls(validated.requests, signal);
    }
  }

  /**
   * 单轮工具批处理（设计 §6.4）。
   * 逐项调用 toolPort.invoke；任一失败 → 整批失败（Fail-Closed），
   *   错误分类遵循 ToolInvocationResult.error_kind（tool_denied 透传 / tool_error）。
   * 全部成功 → 逐项摘要写入 output。
   */
  private async invokeToolCalls(
    requests: ToolInvocationRequest[],
    signal?: AbortSignal
  ): Promise<AgentExecutorResult> {
    const results: ToolInvocationResult[] = [];
    for (const request of requests) {
      if (signal?.aborted) {
        return buildFailure("cancel", "aborted during tool invocation");
      }
      const result = await this.deps.toolPort.invoke(request);
      results.push(result);
    }

    const failed = results.find((r) => !r.ok);
    if (failed) {
      const kind =
        failed.error_kind === "tool_denied" ? "tool_denied" : "tool_error";
      return buildFailure(
        kind,
        failed.error ?? `tool failed (${failed.error_kind ?? "unknown"})`
      );
    }

    const lines = results.map((r, i) => {
      const req = requests[i];
      const value = r.value === undefined ? "(no value)" : JSON.stringify(r.value);
      return `${req.tool} → ${value}`;
    });
    return {
      ok: true,
      output: lines.join("\n"),
      artifacts: [],
    };
  }

  /** 失败折叠：把异常按设计 §8 归一为失败结果。 */
  private collapseCatch(e: unknown, signal?: AbortSignal): AgentExecutorResult {
    if (e instanceof AgentError) {
      return buildFailure(e.kind, e.message);
    }
    if (e instanceof RunnerValidationError) {
      return buildFailure("agent_error", e.message);
    }
    if (e instanceof RunnerError) {
      return buildFailure("agent_error", e.message);
    }
    if (e instanceof Error && e.name === "AbortError") {
      return buildFailure("cancel", "aborted");
    }
    if (signal?.aborted) {
      return buildFailure("cancel", "aborted");
    }
    return buildFailure(
      "agent_error",
      e instanceof Error ? e.message : String(e)
    );
  }
}

/**
 * createAgentExecutor —— 供 Runner 注入的工厂函数。
 *
 * @param context Tool Bridge 产物（AgentExecutionContext）
 * @param instance Runtime 投影（AgentRuntimeInstance）
 * @param toolPort 工具下行端口（Runner 注入，本阶段为 mock 或真实 hostPort）
 * @param signal 可选取消信号
 * @param deps 可选：覆盖 modelAdapter / responseParser / actionValidator（测试注入用）
 *
 * 使用示例（Runner 注入）：
 * ```ts
 * const executor = createAgentExecutor(context, instance, hostPort);
 * const runnerDeps: RunnerDeps = { toolPort: hostPort, executor };
 * const result = await execute(invocation, runnerDeps);
 * ```
 */
export function createAgentExecutor(
  context: AgentExecutionContext,
  instance: AgentRuntimeInstance,
  toolPort: ToolInvocationPort,
  signal?: AbortSignal,
  deps?: Pick<
    AgentExecutorDeps,
    "modelAdapter" | "responseParser" | "actionValidator"
  >
): AgentExecutor {
  return new AgentExecutorImpl({
    context,
    instance,
    toolPort,
    signal,
    ...deps,
  });
}
