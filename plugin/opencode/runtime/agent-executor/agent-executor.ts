/**
 * MyTeam OpenCode Plugin — Agent Executor (agent-executor.ts) — v1.8.0
 * ---------------------------------------------------------------------------
 * Phase 7 — AgentExecutor Core。
 *
 * 核心公式：
 *   AgentExecutionContext（Tool Bridge 产物）
 *      + AgentRuntimeInstance（Runtime 投影）
 *      + Runner ToolInvocationPort（工具下行通道）
 *      └─ AgentExecutor ─┐
 *                        ▼
 *              AgentExecutorResult（执行结果）
 *
 * 职责：
 *   1. 实现 runner/types.ts 的 AgentExecutor 接口。
 *   2. 把 TaskInput 搬上宿主工具通道（ToolInvocationPort）。
 *   3. 汇总执行结果：output / artifacts / checkpoint / error。
 *
 * 禁则（本阶段强制）：
 *   - 不自己猜测输入（只消费 TaskInput）。
 *   - 不绕过 Tool Bridge（工具白名单来自 context.tools）。
 *   - 不写宿主配置 / 不写 MyTeam Home。
 *   - 不启动 MCP 进程（MCP 由宿主已有通道执行）。
 *   - 不做 Trace（trace_hint 仅为诊断标注）。
 * ---------------------------------------------------------------------------
 */

import type {
  AgentExecutor,
  AgentExecutorResult,
  TaskInput,
  ToolInvocationPort,
} from "../runner/types";
import type { AgentExecutionContext } from "../tool-bridge/context";
import type { AgentRuntimeInstance } from "../../agent-instance";
import { RunnerError, RunnerValidationError } from "../runner/types";

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
}

// ---------------------------------------------------------------------------
// AgentExecutorImpl —— 可插拔执行适配器
// ---------------------------------------------------------------------------

/**
 * AgentExecutorImpl —— Runner 的 AgentExecutor 真实实现。
 *
 * 流程（设计 §4）：
 *   1. 校验 TaskInput（goal / workspace / instance_id 与 executor 注入的 instance 一致）。
 *   2. 调用 ToolInvocationPort（如果 taskInput 中有工具调用需求；缺省 = 直接返回空结果）。
 *   3. 汇总结果：output / artifacts / checkpoint / error。
 *
 * 不变量：
 *   - 只消费 context.tools 中已声明的工具（不自行发明工具名）。
 *   - 工具调用失败 → 映射为 agent_error（不重试；重试由 Runner 层负责）。
 *   - 路径类参数由 Runner 层在 invokeTool 中二次校验（本层不重复校验）。
 *   - 不写盘（产物由宿主工具本体产出；本层只登记描述）。
 */
export class AgentExecutorImpl implements AgentExecutor {
  private readonly deps: AgentExecutorDeps;

  constructor(deps: AgentExecutorDeps) {
    this.deps = deps;
  }

  /**
   * 执行 TaskInput，返回 AgentExecutorResult。
   * 任何异常 → 折叠为带 error 的失败结果（不外泄裸异常）。
   */
  async execute(
    taskInput: TaskInput,
    signal?: AbortSignal
  ): Promise<AgentExecutorResult> {
    const effectiveSignal = signal ?? this.deps.signal;

    try {
      // 1. 校验
      this.validateTaskInput(taskInput);

      // 2. 取消信号检查
      if (effectiveSignal?.aborted) {
        return this.failure("cancel", "aborted before execution");
      }

      // 3. 本阶段：TaskInput 不含显式工具调用序列。
      //    执行体 = 把 goal 作为输出直接返回（占位实现）。
      //    未来版本将在此处调用 ToolInvocationPort 执行工具序列。
      return {
        ok: true,
        output: taskInput.goal,
        artifacts: [],
      };
    } catch (e) {
      if (e instanceof RunnerValidationError) {
        return this.failure("assertion_error", e.message);
      }
      if (e instanceof RunnerError) {
        return this.failure(e.kind, e.message, e.kind);
      }
      // 宿主取消
      if (
        (typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError") ||
        effectiveSignal?.aborted
      ) {
        return this.failure("cancel", "aborted");
      }
      // 其余归 agent_error
      return this.failure(
        "agent_error",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 内部
  // ---------------------------------------------------------------------------

  /** 校验 TaskInput 与 context / instance 的一致性（与 Runner validateInvocation 同源）。 */
  private validateTaskInput(taskInput: TaskInput): void {
    const ctx = this.deps.context;
    const inst = this.deps.instance;

    if (taskInput.instance_id !== inst.id) {
      throw new RunnerValidationError(
        `instance id mismatch: taskInput=${taskInput.instance_id} executor=${inst.id}`
      );
    }
    if (taskInput.agent !== inst.agent) {
      throw new RunnerValidationError(
        `agent mismatch: taskInput=${taskInput.agent} instance=${inst.agent}`
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
        `context.agent_instance.id mismatch: context=${ctx.agent_instance.id} instance=${inst.id}`
      );
    }
  }

  /** 构建失败结果。 */
  private failure(
    kind: string,
    detail: string,
    errorCode?: string
  ): AgentExecutorResult {
    void kind;
    void errorCode;
    return {
      ok: false,
      output: "",
      artifacts: [],
      error: detail,
    };
  }
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

/**
 * createAgentExecutor —— 供 Runner 注入的工厂函数。
 *
 * @param context Tool Bridge 产物（AgentExecutionContext）
 * @param instance Runtime 投影（AgentRuntimeInstance）
 * @param toolPort 工具下行端口（Runner 注入，本阶段为 mock 或真实 hostPort）
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
  signal?: AbortSignal
): AgentExecutor {
  return new AgentExecutorImpl({ context, instance, toolPort, signal });
}
